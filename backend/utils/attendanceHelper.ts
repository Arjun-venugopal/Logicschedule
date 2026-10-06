import Schedule from '../models/Schedule';
import Student from '../models/Student';
import Batch from '../models/Batch';
import { getKolkataNow, formatDateToYYYYMMDD, timeToMinutes } from './scheduleHelper';
import { serverCache, deleteDiskCache } from './cache';

/**
 * Fetch all student IDs enrolled in the given batch.
 */
export async function getBatchStudentIds(batchId: any): Promise<string[]> {
  if (!batchId) return [];
  const bId = typeof batchId === 'object' ? (batchId._id ? batchId._id.toString() : batchId.toString()) : batchId.toString();
  if (!bId) return [];

  const cacheKey = `batch_student_ids_${bId}`;
  const cached = serverCache.get(cacheKey);
  if (Array.isArray(cached)) {
    return cached;
  }

  const ids = new Set<string>();

  try {
    const students = await Student.find({ batch: bId });
    if (Array.isArray(students)) {
      students.forEach((s: any) => {
        if (s && s._id) ids.add(s._id.toString());
      });
    }
  } catch (err: any) {
    console.error('Error fetching students by batch in getBatchStudentIds:', err.message);
  }

  try {
    const batchDoc = await Batch.findById(bId);
    if (batchDoc && Array.isArray(batchDoc.students)) {
      batchDoc.students.forEach((st: any) => {
        const id = st?._id ? st._id.toString() : (typeof st === 'string' ? st : '');
        if (id) ids.add(id);
      });
    }
  } catch (err: any) {
    console.error('Error fetching batch students in getBatchStudentIds:', err.message);
  }

  const result = Array.from(ids);
  serverCache.set(cacheKey, result, 30_000);
  return result;
}

/**
 * Automatically resolve attendance according to requirements:
 * 1. Completed class: automatically mark student(s) present (isPresent: true).
 *    Preserves custom teacher overrides if explicitly passed.
 * 2. Cancelled class: automatically mark student(s) absent (isPresent: false).
 * 3. Scheduled class: student attendance mark by teacher based on the date.
 *    If teacher provided attendance, preserves and saves their marks.
 * 4. Rescheduled class: empty array [] (attendance moves to new date).
 */
export async function resolveScheduleAttendance(params: {
  status: string;
  batchId: any;
  date?: string | Date;
  existingAttendance?: any[];
  inputAttendance?: any[];
  preserveCustomIfCompleted?: boolean;
}): Promise<any[]> {
  const { status, batchId, date, existingAttendance, inputAttendance, preserveCustomIfCompleted } = params;

  if (status === 'Rescheduled') {
    // "reschedule no mark anything on this slot"
    return [];
  }

  // Format date string if provided
  const dateStr = date
    ? (typeof date === 'string'
        ? date.split('T')[0]
        : (date instanceof Date ? date.toISOString().split('T')[0] : ''))
    : undefined;

  // Gather all enrolled students for the batch
  const batchStudentIds = await getBatchStudentIds(batchId);
  const studentIdSet = new Set<string>(batchStudentIds);

  // Also include any students explicitly provided in inputAttendance or existingAttendance
  if (Array.isArray(inputAttendance)) {
    inputAttendance.forEach((a: any) => {
      const sId = a.studentId?._id ? a.studentId._id.toString() : (a.studentId ? a.studentId.toString() : '');
      if (sId) studentIdSet.add(sId);
    });
  }
  if (Array.isArray(existingAttendance)) {
    existingAttendance.forEach((a: any) => {
      const sId = a.studentId?._id ? a.studentId._id.toString() : (a.studentId ? a.studentId.toString() : '');
      if (sId) studentIdSet.add(sId);
    });
  }

  const studentIds = Array.from(studentIdSet);
  if (studentIds.length === 0) {
    return [];
  }

  // Helper to build attendance record with optional date
  const createRecord = (studentId: string, isPresent: boolean, notes?: string) => {
    const record: any = { studentId, isPresent };
    if (dateStr) record.date = dateStr;
    if (notes) record.notes = notes;
    return record;
  };

  // 1. Cancelled class: auto mark all students absent
  if (status === 'Cancelled') {
    return studentIds.map(studentId => createRecord(studentId, false));
  }

  // 2. Completed class: auto mark all students present (preserving teacher custom markings if provided)
  if (status === 'Completed') {
    const sourceList = (Array.isArray(inputAttendance) && inputAttendance.length > 0)
      ? inputAttendance
      : (preserveCustomIfCompleted && Array.isArray(existingAttendance) && existingAttendance.length > 0 ? existingAttendance : null);

    if (sourceList && sourceList.length > 0) {
      const statusMap = new Map<string, { isPresent: boolean; notes?: string }>();
      sourceList.forEach((a: any) => {
        const sId = a.studentId?._id ? a.studentId._id.toString() : (a.studentId ? a.studentId.toString() : '');
        if (sId) {
          statusMap.set(sId, { isPresent: !!a.isPresent, notes: a.notes });
        }
      });
      return studentIds.map(studentId => {
        if (statusMap.has(studentId)) {
          const custom = statusMap.get(studentId)!;
          return createRecord(studentId, custom.isPresent, custom.notes);
        }
        return createRecord(studentId, true); // default to present if completed
      });
    }

    // Default for completed: all enrolled students marked present
    return studentIds.map(studentId => createRecord(studentId, true));
  }

  // 3. Scheduled class: student attendance is only recorded when marked Completed
  if (status === 'Scheduled') {
    return [];
  }

  return [];
}

/**
 * Periodically or on-demand checks past schedules that are still marked 'Scheduled'.
 * Once their class end time has passed, automatically marks them 'Completed'
 * and marks enrolled students 'present' in attendance.
 */
let isAutoCompleting = false;
let lastAutoCompleteTime = 0;

export async function autoCompletePastSchedules(force: boolean = false): Promise<number> {
  const now = Date.now();
  if (isAutoCompleting) return 0;
  if (!force && now - lastAutoCompleteTime < 30_000) return 0;
  isAutoCompleting = true;
  lastAutoCompleteTime = now;

  try {
    const kolkata = getKolkataNow();
    const todayEnd = new Date(`${kolkata.todayStr}T23:59:59.999Z`);
    const batchesToCheck = new Set<string>();
    let futureResetCount = 0;
    let completedCount = 0;

    // 1. Enforce requirement: Any class strictly AFTER today (date > todayStr)
    // MUST NEVER be marked Completed; it must strictly be 'Scheduled'.
    // Query only completed classes where date is greater than todayEnd
    const completedClasses = await Schedule.find({
      status: 'Completed',
      date: { $gt: todayEnd }
    });
    if (Array.isArray(completedClasses)) {
      for (const schedule of completedClasses) {
        if (!schedule.date) continue;
        const sDateStr = formatDateToYYYYMMDD(schedule.date);
        if (!sDateStr) continue;

        // If the date is strictly after today, revert to Scheduled
        if (sDateStr > kolkata.todayStr) {
          schedule.status = 'Scheduled';
          schedule.attendance = [];
          if (typeof schedule.notes === 'string' && schedule.notes.includes('Auto-generated as Completed')) {
            schedule.notes = schedule.notes.replace('Auto-generated as Completed (Late join)', 'Auto-generated for batch');
          }
          await schedule.save();
          futureResetCount++;

          const batchId = schedule.batch?._id ? schedule.batch._id : schedule.batch;
          if (batchId) {
            batchesToCheck.add(batchId.toString());
          }
        }
      }
    }

    // 2. Scheduled classes that have finished (previous days or today with end time passed)
    // Prune by querying only scheduled classes up to todayEnd
    const scheduledClasses = await Schedule.find({
      status: 'Scheduled',
      date: { $lte: todayEnd }
    });
    if (Array.isArray(scheduledClasses)) {
      for (const schedule of scheduledClasses) {
        if (!schedule.date || !schedule.endTime) continue;
        const sDateStr = formatDateToYYYYMMDD(schedule.date);
        if (!sDateStr) continue;

        // If strictly after today, it must remain Scheduled
        if (sDateStr > kolkata.todayStr) {
          continue;
        }

        const isPastDate = sDateStr < kolkata.todayStr;
        const isToday = sDateStr === kolkata.todayStr;
        const endMinutes = timeToMinutes(schedule.endTime);

        const isCompletedByTime = isPastDate || (isToday && endMinutes >= 0 && endMinutes <= kolkata.currentTotalMinutes);

        if (isCompletedByTime) {
          const batchId = schedule.batch?._id ? schedule.batch._id : schedule.batch;
          const attendance = await resolveScheduleAttendance({
            status: 'Completed',
            batchId,
            date: schedule.date,
            existingAttendance: schedule.attendance,
            preserveCustomIfCompleted: true,
          });

          schedule.status = 'Completed';
          schedule.attendance = attendance;
          await schedule.save();
          completedCount++;

          if (batchId) {
            batchesToCheck.add(batchId.toString());
          }
        }
      }
    }

    // Optimization: Batch-fetch all schedules in a single query to eliminate N+1 overhead
    const candidateBatches = await Batch.find({ status: { $in: ['Active', 'Upcoming', 'Completed'] } });
    if (Array.isArray(candidateBatches) && candidateBatches.length > 0) {
      const validBatches = candidateBatches.filter((b: any) => b && b.status !== 'Dropped');
      const bIds = validBatches.map((b: any) => b._id);

      const allBatchSchedules = await Schedule.find({ batch: { $in: bIds } });
      const schedulesByBatch = new Map<string, any[]>();
      if (Array.isArray(allBatchSchedules)) {
        for (const s of allBatchSchedules) {
          const bId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
          if (!bId) continue;
          let list = schedulesByBatch.get(bId);
          if (!list) {
            list = [];
            schedulesByBatch.set(bId, list);
          }
          list.push(s);
        }
      }

      for (const batch of validBatches) {
        try {
          const batchSchedules = schedulesByBatch.get(batch._id.toString()) || [];
          const finishedCount = batchSchedules.filter((s: any) => s.status === 'Completed').length;
          const targetSessions = (batch.numberOfSessions && Number(batch.numberOfSessions) > 0)
            ? Number(batch.numberOfSessions)
            : batchSchedules.length;

          const isClassCompleted = targetSessions > 0 && finishedCount >= targetSessions;

          if (isClassCompleted && batch.status !== 'Completed') {
            batch.status = 'Completed';
            await batch.save();
            console.log(`[autoCompletePastSchedules] Batch "${batch.name}" marked Completed (${finishedCount}/${targetSessions} classes finished).`);
          } else if (!isClassCompleted && batch.status === 'Completed' && targetSessions > 0 && finishedCount < targetSessions) {
            batch.status = 'Active';
            await batch.save();
            console.log(`[autoCompletePastSchedules] Batch "${batch.name}" marked Active (${finishedCount}/${targetSessions} classes finished).`);
          }
        } catch (err: any) {
          console.error('Error syncing batch completion in autoCompletePastSchedules:', err.message);
        }
      }
    }

    const totalUpdated = futureResetCount + completedCount;
    if (totalUpdated > 0) {
      console.log(`[autoCompletePastSchedules] Processed ${totalUpdated} classes (${completedCount} auto-completed past/today, ${futureResetCount} future classes reset to Scheduled).`);
      serverCache.clearPattern('timings_');
      serverCache.clearPattern('stats_');
      serverCache.clearPattern('batches_');
      serverCache.clearPattern('schedules_');
      deleteDiskCache('schedules_all');
    }

    return totalUpdated;
  } catch (error: any) {
    console.error('Error in autoCompletePastSchedules:', error.message);
    return 0;
  } finally {
    isAutoCompleting = false;
  }
}

/**
 * Starts a background interval to automatically mark completed classes and attendance
 */
export function startScheduleAutoCompleter(intervalMs: number = 60_000): NodeJS.Timeout {
  // Run on startup shortly after boot
  setTimeout(() => {
    autoCompletePastSchedules().catch((err) => {
      console.error('Initial autoCompletePastSchedules error:', err);
    });
  }, 3000);

  return setInterval(() => {
    autoCompletePastSchedules().catch((err) => {
      console.error('Interval autoCompletePastSchedules error:', err);
    });
  }, intervalMs);
}
