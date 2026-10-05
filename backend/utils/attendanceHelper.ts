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

  return Array.from(ids);
}

/**
 * Automatically resolve attendance according to requirements:
 * 1. Completed class: automatically mark student(s) present (isPresent: true).
 *    Preserves custom teacher overrides if explicitly passed.
 * 2. Cancelled class: automatically mark student(s) absent (isPresent: false).
 * 3. Rescheduled class: no mark anything (empty array []).
 * 4. Scheduled class: no mark anything (empty array []).
 */
export async function resolveScheduleAttendance(params: {
  status: string;
  batchId: any;
  existingAttendance?: any[];
  inputAttendance?: any[];
  preserveCustomIfCompleted?: boolean;
}): Promise<any[]> {
  const { status, batchId, existingAttendance, inputAttendance, preserveCustomIfCompleted } = params;

  if (status === 'Rescheduled' || status === 'Scheduled') {
    // "reschedule no mark anything"
    return [];
  }

  const studentIds = await getBatchStudentIds(batchId);
  if (studentIds.length === 0) {
    return [];
  }

  if (status === 'Cancelled') {
    // "else class cancled mark absent"
    return studentIds.map(studentId => ({
      studentId,
      isPresent: false
    }));
  }

  if (status === 'Completed') {
    // "after class is completed automatically mark the student present in attendance"
    const sourceList = (Array.isArray(inputAttendance) && inputAttendance.length > 0)
      ? inputAttendance
      : (preserveCustomIfCompleted && Array.isArray(existingAttendance) && existingAttendance.length > 0 ? existingAttendance : null);

    if (sourceList && sourceList.length > 0) {
      const statusMap = new Map<string, boolean>();
      sourceList.forEach((a: any) => {
        const sId = a.studentId?._id ? a.studentId._id.toString() : (a.studentId ? a.studentId.toString() : '');
        if (sId) {
          statusMap.set(sId, !!a.isPresent);
        }
      });
      return studentIds.map(studentId => ({
        studentId,
        isPresent: statusMap.has(studentId) ? statusMap.get(studentId)! : true
      }));
    }

    // Default: All enrolled students marked present
    return studentIds.map(studentId => ({
      studentId,
      isPresent: true
    }));
  }

  return [];
}

/**
 * Periodically or on-demand checks past schedules that are still marked 'Scheduled'.
 * Once their class end time has passed, automatically marks them 'Completed'
 * and marks enrolled students 'present' in attendance.
 */
let isAutoCompleting = false;

export async function autoCompletePastSchedules(): Promise<number> {
  if (isAutoCompleting) return 0;
  isAutoCompleting = true;

  try {
    const kolkata = getKolkataNow();
    const scheduledClasses = await Schedule.find({ status: 'Scheduled' });
    if (!scheduledClasses || scheduledClasses.length === 0) {
      return 0;
    }

    let updatedCount = 0;
    const batchesToCheck = new Set<string>();

    for (const schedule of scheduledClasses) {
      if (!schedule.date || !schedule.endTime) continue;
      const sDateStr = formatDateToYYYYMMDD(schedule.date);
      if (!sDateStr) continue;

      const isPastDate = sDateStr < kolkata.todayStr;
      const isToday = sDateStr === kolkata.todayStr;
      const endMinutes = timeToMinutes(schedule.endTime);

      const isCompletedByTime = isPastDate || (isToday && endMinutes >= 0 && endMinutes <= kolkata.currentTotalMinutes);

      if (isCompletedByTime) {
        const batchId = schedule.batch?._id ? schedule.batch._id : schedule.batch;
        const attendance = await resolveScheduleAttendance({
          status: 'Completed',
          batchId,
          existingAttendance: schedule.attendance,
          preserveCustomIfCompleted: true,
        });

        schedule.status = 'Completed';
        schedule.attendance = attendance;
        await schedule.save();
        updatedCount++;

        if (batchId) {
          batchesToCheck.add(batchId.toString());
        }
      }
    }

    // Check if any batches now have all classes completed
    for (const bId of batchesToCheck) {
      try {
        const batch = await Batch.findById(bId);
        if (batch && batch.status !== 'Completed') {
          const allBatchSchedules = await Schedule.find({ batch: batch._id });
          const allCompleted = allBatchSchedules.length > 0 &&
            allBatchSchedules.every((s: any) => s.status === 'Completed');
          if (allCompleted) {
            batch.status = 'Completed';
            await batch.save();
          }
        }
      } catch (err: any) {
        console.error('Error syncing batch completion in autoCompletePastSchedules:', err.message);
      }
    }

    if (updatedCount > 0) {
      console.log(`[autoCompletePastSchedules] Automatically completed ${updatedCount} finished classes and marked attendance present.`);
      serverCache.clearPattern('timings_');
      serverCache.clearPattern('stats_');
      serverCache.clearPattern('batches_');
      serverCache.clearPattern('schedules_');
      deleteDiskCache('schedules_all');
    }

    return updatedCount;
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
