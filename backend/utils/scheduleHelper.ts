/**
 * Schedule Conflict & Interval Utilities
 * Provides optimized interval-based time-slot conflict detection algorithms.
 * Uses minute-normalization and binary search sweep-line for O(N log N) / O(log N) operations.
 */
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';

export interface TimeSlot {
  _id?: string;
  startTime: string;
  endTime: string;
  status?: string;
  [key: string]: any;
}

/**
 * Converts "HH:mm" or "H:mm" to total minutes from midnight (0..1439).
 * Returns -1 if invalid.
 */
export function timeToMinutes(timeStr: string | undefined | null): number {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Normalized interval representation with numeric minutes for ultra-fast comparisons.
 */
interface ParsedInterval {
  id?: string;
  startMin: number;
  endMin: number;
  raw: TimeSlot;
}

/**
 * Binary search to find the index of the first interval where slot.startMin >= targetEnd.
 * All intervals before this index could potentially overlap if their endMin > targetStart.
 */
function binarySearchUpperBound(intervals: ParsedInterval[], targetEnd: number): number {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (intervals[mid].startMin >= targetEnd) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

/**
 * Checks if a new time slot [startTime, endTime] overlaps with an existing array of slots.
 * Converts times to minutes and uses binary search interval pruning.
 */
export function checkIntervalConflict(
  existingSlots: TimeSlot[],
  newSlot: { startTime: string; endTime: string; excludeId?: string }
): boolean {
  return findConflictingSlot(existingSlots, newSlot) !== null;
}

/**
 * Finds and returns the first conflicting TimeSlot, or null if no conflict exists.
 */
export function findConflictingSlot(
  existingSlots: TimeSlot[],
  newSlot: { startTime: string; endTime: string; excludeId?: string }
): TimeSlot | null {
  const targetStart = timeToMinutes(newSlot.startTime);
  const targetEnd = timeToMinutes(newSlot.endTime);

  if (targetStart < 0 || targetEnd < 0 || targetEnd <= targetStart) {
    return null;
  }

  const excludeIdStr = newSlot.excludeId ? String(newSlot.excludeId) : null;

  // Filter and parse valid intervals
  const parsedIntervals: ParsedInterval[] = [];
  for (let i = 0; i < existingSlots.length; i++) {
    const slot = existingSlots[i];
    if (!slot || slot.status === 'Cancelled') continue;
    if (excludeIdStr && (slot._id?.toString() === excludeIdStr || (slot as any).id?.toString() === excludeIdStr)) {
      continue;
    }
    const startMin = timeToMinutes(slot.startTime);
    let endMin = timeToMinutes(slot.endTime);
    if (startMin < 0 || endMin < 0) continue;
    if (endMin < startMin) endMin += 1440; // Spanning midnight adjustment

    parsedIntervals.push({
      id: slot._id ? String(slot._id) : undefined,
      startMin,
      endMin,
      raw: slot,
    });
  }

  if (parsedIntervals.length === 0) return null;

  // Sort intervals by startMin
  parsedIntervals.sort((a, b) => a.startMin - b.startMin);

  // Binary search: prune all intervals whose startMin >= targetEnd
  const cutoffIndex = binarySearchUpperBound(parsedIntervals, targetEnd);

  // Check candidate intervals up to cutoff
  for (let i = 0; i < cutoffIndex; i++) {
    const interval = parsedIntervals[i];
    // Overlap condition: targetStart < interval.endMin AND targetEnd > interval.startMin
    if (targetStart < interval.endMin && targetEnd > interval.startMin) {
      return interval.raw;
    }
  }

  return null;
}

/**
 * Checks for schedule or demo session conflict for a teacher on a specific date.
 * Cross-references both Schedule and DemoSession collections.
 */
export async function checkTeacherConflict(params: {
  teacherId: string;
  date: Date;
  startTime: string;
  endTime: string;
  excludeScheduleId?: string;
  excludeDemoId?: string;
}): Promise<{ hasConflict: boolean; conflictingWith?: string }> {
  const { teacherId, date, startTime, endTime, excludeScheduleId, excludeDemoId } = params;
  if (!teacherId || !date || !startTime || !endTime) {
    return { hasConflict: false };
  }

  const [existingSchedules, existingDemos] = await Promise.all([
    Schedule.find({
      teacher: teacherId,
      date,
      status: { $ne: 'Cancelled' },
    }).select('_id startTime endTime status subject batch'),
    DemoSession.find({
      teacher: teacherId,
      date,
      status: { $ne: 'Cancelled' },
    }).select('_id startTime endTime status subject studentName'),
  ]);

  const conflictingSchedule = findConflictingSlot(existingSchedules, {
    startTime,
    endTime,
    excludeId: excludeScheduleId,
  });

  if (conflictingSchedule) {
    return { hasConflict: true, conflictingWith: `Regular Class (${conflictingSchedule.startTime} - ${conflictingSchedule.endTime})` };
  }

  const conflictingDemo = findConflictingSlot(existingDemos, {
    startTime,
    endTime,
    excludeId: excludeDemoId,
  });

  if (conflictingDemo) {
    return { hasConflict: true, conflictingWith: `Demo Session (${conflictingDemo.startTime} - ${conflictingDemo.endTime})` };
  }

  return { hasConflict: false };
}

/**
 * Groups schedules by teacher ID and date key for O(1) indexed lookup.
 */
export function indexSchedulesByTeacherAndDate(schedules: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const s of schedules) {
    if (!s.teacher || !s.date) continue;
    const tId = s.teacher._id ? s.teacher._id.toString() : s.teacher.toString();
    const dateKey = typeof s.date === 'string' ? s.date.split('T')[0] : (s.date instanceof Date ? s.date.toISOString().split('T')[0] : String(s.date).split('T')[0]);
    const key = `${tId}:${dateKey}`;

    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(s);
  }
  return map;
}
