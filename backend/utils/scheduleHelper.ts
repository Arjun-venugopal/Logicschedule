/**
 * Schedule Conflict & Interval Utilities
 * Provides optimized interval-based time-slot conflict detection algorithms.
 */

export interface TimeSlot {
  _id?: string;
  startTime: string;
  endTime: string;
  status?: string;
}

/**
 * Checks if a new time slot [startTime, endTime] overlaps with an existing array of slots.
 * Sorts intervals by startTime and performs neighboring interval checks in O(N log N) time.
 */
export function checkIntervalConflict(
  existingSlots: TimeSlot[],
  newSlot: { startTime: string; endTime: string; excludeId?: string }
): boolean {
  if (!newSlot.startTime || !newSlot.endTime) return false;

  const validSlots = existingSlots.filter((slot) => {
    if (slot.status === 'Cancelled') return false;
    if (newSlot.excludeId && slot._id?.toString() === newSlot.excludeId.toString()) return false;
    return Boolean(slot.startTime && slot.endTime);
  });

  if (validSlots.length === 0) return false;

  // Sort existing intervals by start time
  const sorted = [...validSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const targetStart = newSlot.startTime;
  const targetEnd = newSlot.endTime;

  // Binary search or neighboring interval check
  for (let i = 0; i < sorted.length; i++) {
    const slot = sorted[i];
    // Overlap condition: targetStart < slot.endTime AND targetEnd > slot.startTime
    if (targetStart < slot.endTime && targetEnd > slot.startTime) {
      return true;
    }
    // Optimization: if targetEnd <= slot.startTime, no subsequent sorted slot can overlap
    if (targetEnd <= slot.startTime) {
      break;
    }
  }

  return false;
}

/**
 * Groups schedules by teacher ID and date key for O(1) indexed lookup.
 */
export function indexSchedulesByTeacherAndDate(schedules: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const s of schedules) {
    if (!s.teacher || !s.date) continue;
    const tId = s.teacher._id ? s.teacher._id.toString() : s.teacher.toString();
    const dateKey = typeof s.date === 'string' ? s.date.split('T')[0] : new Date(s.date).toISOString().split('T')[0];
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
