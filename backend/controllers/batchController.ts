import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import Teacher from '../models/Teacher';
import Student from '../models/Student';
import DemoSession from '../models/DemoSession';
import RecycleBin from '../models/RecycleBin';
import { checkIntervalConflict, getKolkataNow } from '../utils/scheduleHelper';
import { serverCache, deleteDiskCache } from '../utils/cache';

// Day name → JS getUTCDay() index
const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

export function normalizeDateOnlyToUtc(val: any): Date | undefined {
  if (!val) return undefined;
  const str = typeof val === 'string'
    ? val.split('T')[0]
    : (val instanceof Date ? val.toISOString().split('T')[0] : String(val).split('T')[0]);
  const parts = str.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return undefined;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
}

export function computeEndTime(startTime: string, durationMinutes: number = 60): string {
  if (!startTime) return '10:00';
  const parts = startTime.split(':').map(Number);
  if (isNaN(parts[0])) return '10:00';
  const mins = (parts[0] * 60 + (parts[1] || 0) + durationMinutes) % (24 * 60);
  const endH = Math.floor(mins / 60);
  const endM = mins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function getSlotTimingForDay(batch: any, date: Date | number): { startTime: string; endTime: string } {
  const d = new Date(date);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[d.getUTCDay()];
  const dayNameLower = dayName ? dayName.toLowerCase() : '';
  
  const dayTimings = batch.dayTimings;
  if (dayTimings && typeof dayTimings === 'object') {
    const entry = dayTimings[dayName] || dayTimings[dayNameLower];
    if (entry && entry.startTime) {
      const sTime = entry.startTime;
      const eTime = entry.endTime || computeEndTime(sTime, 60);
      return { startTime: sTime, endTime: eTime };
    }
  }

  const sTime = batch.timing?.startTime || '09:00';
  const eTime = batch.timing?.endTime || computeEndTime(sTime, 60);
  return { startTime: sTime, endTime: eTime };
}

/**
 * Generate schedule entries for every matching class day starting from startDate.
 * If numberOfSessions is set, generates that exact number of classes.
 * Otherwise, generates schedules for 6 months (180 days) so classes are never cut off.
 * Detects conflicts with teacher's other batches and demo sessions in O(1) per date.
 */
export async function generateSchedulesForBatch(
  batch: any,
  rawPreCompletedClasses: number = 0,
  studentId?: string,
  customTargetSessions?: number
): Promise<number> {
  const { _id, assignedTeacher, timing, days, meetingLink, startDate, numberOfSessions } = batch;

  const hasTiming =
    (timing?.startTime && timing?.endTime) ||
    (batch.dayTimings && typeof batch.dayTimings === 'object' && Object.keys(batch.dayTimings).length > 0) ||
    timing?.startTime;

  if (!startDate || !days?.length || !hasTiming) {
    return 0; // Not enough info to auto-generate
  }

  const cursor = normalizeDateOnlyToUtc(startDate);
  if (!cursor) return 0;

  const teacherId = assignedTeacher?._id
    ? assignedTeacher._id.toString()
    : (assignedTeacher ? assignedTeacher.toString() : undefined);
  let batchTeacherName = assignedTeacher?.name || '';
  if (teacherId && !batchTeacherName) {
    try {
      const tDoc = await Teacher.findById(teacherId).populate('user', 'name');
      batchTeacherName = tDoc?.name || (tDoc as any)?.user?.name || '';
    } catch {}
  }

  const preCompletedClasses = Math.max(0, Number(rawPreCompletedClasses) || Number(batch.preCompletedClasses) || 0);
  const batchSessions = numberOfSessions && Number(numberOfSessions) > 0 ? Number(numberOfSessions) : 0;
  const targetSessions = (customTargetSessions && Number(customTargetSessions) > 0)
    ? Number(customTargetSessions)
    : batchSessions;
  const selectedDayIndexes = new Set((days as string[]).map((d) => DAY_INDEX[d]).filter(d => d !== undefined));

  const kolkata = getKolkataNow();
  const todayEnd = new Date(`${kolkata.todayStr}T23:59:59.999Z`);
  const todayUtc = normalizeDateOnlyToUtc(kolkata.todayStr)!;

  // Pre-fetch all schedules for this batch
  const existingSchedules = await Schedule.find({ batch: _id });
  const existingTimes = new Set(existingSchedules.map((s: any) => new Date(s.date).getTime()));
  const existingCompletedCount = existingSchedules.filter((s: any) => s.status === 'Completed').length;

  // Pre-fetch teacher's other schedules and demo sessions to detect conflicts
  const teacherSlotsByDate = new Map<string, any[]>();
  if (teacherId) {
    const [tScheds, tDemos] = await Promise.all([
      Schedule.find({ teacher: teacherId, status: { $ne: 'Cancelled' } }).select('date startTime endTime batch'),
      DemoSession.find({ teacher: teacherId, status: { $ne: 'Cancelled' } }).select('date startTime endTime')
    ]);

    const addToMap = (items: any[]) => {
      for (const item of items) {
        if (!item.date || !item.startTime || !item.endTime) continue;
        const dStr = normalizeDateOnlyToUtc(item.date)?.toISOString().split('T')[0];
        if (!dStr) continue;
        let list = teacherSlotsByDate.get(dStr);
        if (!list) {
          list = [];
          teacherSlotsByDate.set(dStr, list);
        }
        list.push(item);
      }
    };
    addToMap(tScheds);
    addToMap(tDemos);
  }

  // Pre-fetch students of this batch so attendance can be marked for pre-completed classes
  let batchStudentIds: string[] = [];
  try {
    const studentsInBatch = await Student.find({ batch: _id }).select('_id');
    batchStudentIds = studentsInBatch.map((s: any) => s._id.toString());
  } catch {
    // ignore
  }
  if (studentId && !batchStudentIds.includes(studentId)) {
    batchStudentIds.push(studentId);
  }

  const schedulesToCreate: any[] = [];
  const neededCompleted = Math.max(0, preCompletedClasses - existingCompletedCount);

  // Generate calendar schedules starting strictly from Start Date forward (Requirements 3 & 4)
  // 1. Never schedule classes before the batch Start Date.
  // 2. Classes on or after Start Date whose scheduled date/time have passed become Completed up to neededCompleted.
  // 3. Classes in the future (or once neededCompleted is satisfied) become Scheduled up to targetSessions.
  const forwardCursor = new Date(cursor.getTime());
  let forwardDaysScanned = 0;
  let completedCreated = 0;
  let scheduledCount = existingSchedules.filter((s: any) => s.status === 'Scheduled').length;
  const maxScanDays = 400;

  while (forwardDaysScanned < maxScanDays) {
    if (targetSessions > 0 && (existingCompletedCount + completedCreated + scheduledCount) >= targetSessions) {
      break;
    }
    if (targetSessions === 0 && forwardDaysScanned >= 180) {
      break;
    }

    if (selectedDayIndexes.has(forwardCursor.getUTCDay())) {
      const forwardTime = forwardCursor.getTime();

      if (!existingTimes.has(forwardTime)) {
        const dateKey = forwardCursor.toISOString().split('T')[0];
        const daySlots = teacherSlotsByDate.get(dateKey) || [];
        const slotTiming = getSlotTimingForDay(batch, forwardTime);
        const isConflict = checkIntervalConflict(daySlots, {
          startTime: slotTiming.startTime,
          endTime: slotTiming.endTime,
        });

        // Determine if this slot is in the past or right now (Asia/Kolkata)
        const [sh, sm] = (slotTiming.startTime || '09:00').split(':').map(Number);
        const slotMins = (sh || 0) * 60 + (sm || 0);
        const isSlotPastOrNow =
          dateKey < kolkata.todayStr ||
          (dateKey === kolkata.todayStr && kolkata.currentTotalMinutes >= slotMins);

        if (completedCreated < neededCompleted && isSlotPastOrNow) {
          const completedSlot = {
            teacher: teacherId || undefined,
            completedBy: teacherId || undefined,
            completedByName: batchTeacherName || undefined,
            batch: _id,
            date: new Date(forwardTime),
            startTime: slotTiming.startTime,
            endTime: slotTiming.endTime,
            status: 'Completed',
            conflict: isConflict,
            meetingLink: meetingLink || '',
            notes: 'Auto-generated as Completed (Classes Already Completed)',
            attendance: batchStudentIds.map((sId) => ({
              studentId: sId,
              isPresent: true,
              date: new Date(forwardTime),
            })),
          };

          schedulesToCreate.push(completedSlot);
          existingTimes.add(forwardTime);
          daySlots.push(completedSlot);
          teacherSlotsByDate.set(dateKey, daySlots);
          completedCreated++;
        } else {
          const newSlot = {
            teacher: teacherId || undefined,
            batch: _id,
            date: new Date(forwardTime),
            startTime: slotTiming.startTime,
            endTime: slotTiming.endTime,
            status: 'Scheduled',
            conflict: isConflict,
            meetingLink: meetingLink || '',
            notes: 'Auto-generated for batch',
            attendance: batchStudentIds.map((sId) => ({
              studentId: sId,
              isPresent: false,
              date: new Date(forwardTime),
            })),
          };

          schedulesToCreate.push(newSlot);
          existingTimes.add(forwardTime);
          daySlots.push(newSlot);
          teacherSlotsByDate.set(dateKey, daySlots);
          scheduledCount++;
        }
      }
    }

    forwardCursor.setUTCDate(forwardCursor.getUTCDate() + 1);
    forwardDaysScanned++;
  }

  if (schedulesToCreate.length > 0) {
    await Schedule.insertMany(schedulesToCreate);
  }

  return schedulesToCreate.length;
}

// @desc    Get all batches
// @route   GET /batches
// @access  Private
export const getBatches = async (req: any, res: Response) => {
  try {
    const isTeacher = req.user && req.user.role === 'Teacher';
    let teacherId = '';
    if (isTeacher) {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) teacherId = teacher._id.toString();
      else { res.json([]); return; }
    }

    const cacheKey = `batches_${isTeacher ? teacherId : 'all'}`;
    const cached = serverCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const query: any = isTeacher ? { assignedTeacher: teacherId } : {};
    const batches = await Batch.find(query).populate('assignedTeacher', 'name email');

    if (batches.length === 0) {
      serverCache.set(cacheKey, [], 30_000);
      res.json([]);
      return;
    }

    // Fetch schedules count for these unique batches
    const batchIds = Array.from(new Set(batches.map((b: any) => b._id)));
    const allSchedules = await Schedule.find({
      batch: { $in: batchIds }
    });

    const completedCountMap: Record<string, number> = {};
    const cancelledCountMap: Record<string, number> = {};
    const upcomingCountMap: Record<string, number> = {};
    const totalCountMap: Record<string, number> = {};
    const lastCompletedDateMap: Record<string, Date> = {};

    const kolkata = getKolkataNow();
    const todayStr = kolkata.todayStr;

    allSchedules.forEach((s: any) => {
      const bId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
      if (!bId) return;
      totalCountMap[bId] = (totalCountMap[bId] || 0) + 1;

      const sDateStr = s.date ? normalizeDateOnlyToUtc(s.date)?.toISOString().split('T')[0] : '';

      if (s.status === 'Completed') {
        completedCountMap[bId] = (completedCountMap[bId] || 0) + 1;
        if (s.date) {
          const sDate = new Date(s.date);
          if (!isNaN(sDate.getTime()) && (!lastCompletedDateMap[bId] || sDate > lastCompletedDateMap[bId])) {
            lastCompletedDateMap[bId] = sDate;
          }
        }
      } else if (s.status === 'Cancelled') {
        cancelledCountMap[bId] = (cancelledCountMap[bId] || 0) + 1;
      } else {
        // Scheduled
        if (!sDateStr || sDateStr >= todayStr) {
          upcomingCountMap[bId] = (upcomingCountMap[bId] || 0) + 1;
        }
      }
    });

    const enrichedBatches = batches.map((b: any) => {
      const batchObj = b.toObject ? b.toObject() : b;
      const bId = batchObj._id.toString();
      const rawCompleted = completedCountMap[bId] || 0;
      const preCompleted = Math.max(0, Number(batchObj.preCompletedClasses) || 0);
      const completedCount = Math.max(rawCompleted, preCompleted);
      const schedCount = totalCountMap[bId] || 0;
      const targetSessions = (batchObj.numberOfSessions && Number(batchObj.numberOfSessions) > 0)
        ? Number(batchObj.numberOfSessions)
        : Math.max(schedCount, completedCount);

      const isClassCompleted = targetSessions > 0 && completedCount >= targetSessions;
      const effectiveStatus = (isClassCompleted && batchObj.status !== 'Dropped' && batchObj.status !== 'Cancelled')
        ? 'Completed'
        : batchObj.status;

      return {
        ...batchObj,
        status: effectiveStatus,
        completedClassesCount: completedCount,
        cancelledClassesCount: cancelledCountMap[bId] || 0,
        upcomingClassesCount: upcomingCountMap[bId] || 0,
        totalClassesCount: targetSessions,
        scheduledClassesCount: schedCount,
        isCompleted: isClassCompleted || batchObj.status === 'Completed'
      };
    });

    serverCache.set(cacheKey, enrichedBatches, 30_000);
    res.json(enrichedBatches);
  } catch (error: any) {
    console.error('Get batches error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Create a batch + auto-generate schedule entries
// @route   POST /batches
// @access  Private/Admin
export const createBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name, subject, assignedTeacher, studentsCount,
      timing, days, meetingLink,
      startDate, durationType, status, numberOfSessions, preCompletedClasses,
      dayTimings, timeMode
    } = req.body;

    if (!name || !subject) {
      res.status(400).json({ message: 'Batch name and subject are required' });
      return;
    }

    const kolkata = getKolkataNow();
    const cleanStartDate = startDate ? (normalizeDateOnlyToUtc(startDate)?.toISOString().split('T')[0] || '') : '';
    let validatedPreCompleted = 0;

    if (cleanStartDate) {
      if (cleanStartDate > kolkata.todayStr) {
        // Scenario B: Future Date -> 0 completed classes
        validatedPreCompleted = 0;
      } else if (cleanStartDate === kolkata.todayStr) {
        // Scenario A: Start Date is Today
        // Check if today is a configured class day and if time has passed
        const todayParts = cleanStartDate.split('-').map(Number);
        const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0));
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDayName = dayNames[todayUtc.getUTCDay()];
        const isTodayClassDay = Array.isArray(days) && days.includes(todayDayName);

        if (isTodayClassDay) {
          const timingObj = (dayTimings && dayTimings[todayDayName]) || timing || {};
          const [th, tm] = (timingObj.startTime || '09:00').split(':').map(Number);
          const startMins = (th || 0) * 60 + (tm || 0);
          if (kolkata.currentTotalMinutes >= startMins) {
            validatedPreCompleted = 1;
          }
        }
      } else {
        // Scenario C: Start Date is in the past -> mandatory Total Completed Classes
        if (preCompletedClasses === undefined || preCompletedClasses === null || preCompletedClasses === '') {
          res.status(400).json({ message: 'Total Completed Classes is required when Start Date is in the past' });
          return;
        }
        const pre = Number(preCompletedClasses);
        if (isNaN(pre) || pre < 0 || !Number.isInteger(pre)) {
          res.status(400).json({ message: 'Total Completed Classes must be a whole number 0 or greater' });
          return;
        }
        if (numberOfSessions && pre > Number(numberOfSessions)) {
          res.status(400).json({ message: `Total Completed Classes cannot exceed total classes (${numberOfSessions})` });
          return;
        }
        validatedPreCompleted = pre;
      }
    }

    const batch = await Batch.create({
      name,
      subject,
      assignedTeacher: assignedTeacher || undefined,
      studentsCount: studentsCount || 0,
      timing: timing || {},
      dayTimings: dayTimings || {},
      timeMode: timeMode || 'same',
      days: days || [],
      meetingLink: meetingLink || '',
      startDate: normalizeDateOnlyToUtc(startDate),
      durationType: durationType || 'Custom',
      status: status || 'Upcoming',
      numberOfSessions: numberOfSessions || null,
      preCompletedClasses: validatedPreCompleted,
    });

    // Auto-generate calendar schedules for classes based on numberOfSessions or rolling window
    const generated = await generateSchedulesForBatch(batch, validatedPreCompleted);
    console.log(`✅ Auto-generated ${generated} schedule(s) for batch "${name}"`);

    // If teacher was assigned, automatically sync assignedTutor to any enrolled students
    if (batch.assignedTeacher) {
      const batchIdStr = batch._id.toString();
      const allStudents = await Student.find({});
      for (const st of allStudents) {
        const sBatchId = st.batch?._id ? st.batch._id.toString() : (st.batch ? st.batch.toString() : '');
        if (sBatchId === batchIdStr) {
          const currentTutor = st.assignedTutor?._id ? st.assignedTutor._id.toString() : (st.assignedTutor ? st.assignedTutor.toString() : '');
          const targetTeacherStr = (batch.assignedTeacher?._id || batch.assignedTeacher).toString();
          if (currentTutor !== targetTeacherStr) {
            st.assignedTutor = batch.assignedTeacher;
            await st.save();
          }
        }
      }
    }

    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
    serverCache.clearPattern('students_');
    serverCache.clearPattern('timings_');
    serverCache.delete('teachers_all');
    deleteDiskCache('schedules_all');

    const populated = await batch.populate('assignedTeacher', 'name email');
    res.status(201).json({ ...(populated.toObject ? populated.toObject() : populated), schedulesGenerated: generated });
  } catch (error: any) {
    console.error('Create batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a batch + regenerate schedules if dates/days/timing/teacher changed
// @route   PUT /batches/:id
// @access  Private/Admin
export const updateBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id as string);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    const oldTeacherId = batch.assignedTeacher?._id ? batch.assignedTeacher._id.toString() : (batch.assignedTeacher ? batch.assignedTeacher.toString() : '');
    const newTeacherId = req.body.assignedTeacher !== undefined ? (req.body.assignedTeacher || '') : oldTeacherId;
    const teacherChanged = req.body.assignedTeacher !== undefined && String(newTeacherId) !== String(oldTeacherId);

    const oldStartDate = batch.startDate ? normalizeDateOnlyToUtc(batch.startDate)?.toISOString() : '';
    const newStartDate = req.body.startDate !== undefined ? normalizeDateOnlyToUtc(req.body.startDate)?.toISOString() : oldStartDate;
    const startDateChanged = req.body.startDate !== undefined && String(newStartDate || '') !== String(oldStartDate || '');

    const oldDaysStr = JSON.stringify(Array.isArray(batch.days) ? batch.days : []);
    const newDaysStr = req.body.days !== undefined ? JSON.stringify(Array.isArray(req.body.days) ? req.body.days : []) : oldDaysStr;
    const daysChanged = req.body.days !== undefined && newDaysStr !== oldDaysStr;

    const oldTimingStr = JSON.stringify(batch.timing || {});
    const newTimingStr = req.body.timing !== undefined ? JSON.stringify(req.body.timing || {}) : oldTimingStr;
    const oldDayTimingsStr = JSON.stringify(batch.dayTimings || {});
    const newDayTimingsStr = req.body.dayTimings !== undefined ? JSON.stringify(req.body.dayTimings || {}) : oldDayTimingsStr;
    const timingChanged = newTimingStr !== oldTimingStr || newDayTimingsStr !== oldDayTimingsStr || (req.body.timeMode !== undefined && req.body.timeMode !== batch.timeMode);

    const sessionsChanged =
      (req.body.numberOfSessions !== undefined && req.body.numberOfSessions !== batch.numberOfSessions) ||
      (req.body.preCompletedClasses !== undefined && Number(req.body.preCompletedClasses) !== Number(batch.preCompletedClasses));

    const datesChanged = startDateChanged || daysChanged || timingChanged || sessionsChanged;

    batch.name = req.body.name ?? batch.name;
    batch.subject = req.body.subject ?? batch.subject;
    if (req.body.assignedTeacher !== undefined) {
      batch.assignedTeacher = req.body.assignedTeacher ? req.body.assignedTeacher : undefined;
    }
    batch.studentsCount = req.body.studentsCount ?? batch.studentsCount;
    batch.timing = req.body.timing ?? batch.timing;
    batch.dayTimings = req.body.dayTimings ?? batch.dayTimings;
    batch.timeMode = req.body.timeMode ?? batch.timeMode;
    batch.days = req.body.days ?? batch.days;
    batch.meetingLink = req.body.meetingLink ?? batch.meetingLink;
    batch.durationType = req.body.durationType ?? batch.durationType;
    batch.status = req.body.status ?? batch.status;
    batch.numberOfSessions = req.body.numberOfSessions !== undefined ? req.body.numberOfSessions : batch.numberOfSessions;

    if (req.body.startDate !== undefined)
      batch.startDate = normalizeDateOnlyToUtc(req.body.startDate);

    const kolkataNow = getKolkataNow();
    const effectiveStartDate = batch.startDate ? (normalizeDateOnlyToUtc(batch.startDate)?.toISOString().split('T')[0] || '') : '';
    let validatedUpdatePreCompleted = batch.preCompletedClasses || 0;

    if (effectiveStartDate) {
      if (effectiveStartDate > kolkataNow.todayStr) {
        validatedUpdatePreCompleted = 0;
      } else if (effectiveStartDate === kolkataNow.todayStr) {
        const todayParts = effectiveStartDate.split('-').map(Number);
        const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0));
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDayName = dayNames[todayUtc.getUTCDay()];
        const effectiveDays = batch.days || [];
        const isTodayClassDay = Array.isArray(effectiveDays) && effectiveDays.includes(todayDayName);

        if (isTodayClassDay) {
          const timingObj = (batch.dayTimings && batch.dayTimings[todayDayName]) || batch.timing || {};
          const [th, tm] = (timingObj.startTime || '09:00').split(':').map(Number);
          const startMins = (th || 0) * 60 + (tm || 0);
          if (kolkataNow.currentTotalMinutes >= startMins) {
            validatedUpdatePreCompleted = 1;
          } else {
            validatedUpdatePreCompleted = 0;
          }
        } else {
          validatedUpdatePreCompleted = 0;
        }
      } else if (req.body.preCompletedClasses !== undefined) {
        const pre = Number(req.body.preCompletedClasses);
        if (isNaN(pre) || pre < 0 || !Number.isInteger(pre)) {
          res.status(400).json({ message: 'Total Completed Classes must be a whole number 0 or greater' });
          return;
        }
        if (batch.numberOfSessions && pre > Number(batch.numberOfSessions)) {
          res.status(400).json({ message: `Total Completed Classes cannot exceed total classes (${batch.numberOfSessions})` });
          return;
        }
        validatedUpdatePreCompleted = pre;
      }
    }

    batch.preCompletedClasses = validatedUpdatePreCompleted;

    const updated = await batch.save();

    const kolkata = getKolkataNow();
    const todayStart = new Date(`${kolkata.todayStr}T00:00:00.000Z`);

    const existingSchedules = await Schedule.find({ batch: updated._id });
    const existingFutureCount = existingSchedules.filter((s: any) => {
      const sDate = s.date ? new Date(s.date) : null;
      return s.status === 'Scheduled' && sDate && sDate >= todayStart;
    }).length;

    const hasTiming =
      (updated.timing?.startTime && updated.timing?.endTime) ||
      (updated.dayTimings && typeof updated.dayTimings === 'object' && Object.keys(updated.dayTimings).length > 0) ||
      updated.timing?.startTime;

    const targetTeacher = updated.assignedTeacher || null;
    const targetTeacherStr = targetTeacher ? (targetTeacher._id || targetTeacher).toString() : '';

    // When teacher changes, lock completed class history to the historical teacher
    let oldTeacherName = '';
    let newTeacherName = '';
    if (teacherChanged) {
      try {
        if (oldTeacherId) {
          const oldDoc = await Teacher.findById(oldTeacherId).populate('user', 'name');
          oldTeacherName = oldDoc?.name || (oldDoc as any)?.user?.name || '';
        }
        if (newTeacherId) {
          const newDoc = await Teacher.findById(newTeacherId).populate('user', 'name');
          newTeacherName = newDoc?.name || (newDoc as any)?.user?.name || 'Teacher';
        }
        const existingCompletedSchedules = await Schedule.find({ batch: updated._id, status: 'Completed' });
        for (const cs of existingCompletedSchedules) {
          let m = false;
          if (!cs.completedBy) {
            cs.completedBy = cs.replacementTeacher || cs.teacher || oldTeacherId;
            m = true;
          }
          if (!cs.completedByName) {
            cs.completedByName = oldTeacherName || cs.teacher?.name || 'Teacher';
            m = true;
          }
          if (m) await cs.save();
        }
      } catch (hErr: any) {
        console.warn('Error preserving completed schedule conductor:', hErr?.message);
      }
    }

    const canGenerateSchedules = Boolean(updated.startDate && updated.days?.length && hasTiming);
    const shouldRegenerate = datesChanged || (canGenerateSchedules && existingFutureCount === 0);

    if (shouldRegenerate && canGenerateSchedules) {
      // Delete ONLY scheduled classes (preserving all historical attendance and completed records!)
      await Schedule.deleteMany({
        batch: updated._id,
        status: 'Scheduled',
      });
      const generated = await generateSchedulesForBatch(updated, updated.preCompletedClasses || 0);
      console.log(`🔄 Auto-scheduled/regenerated ${generated} class(es) for batch "${updated.name}"`);
    } else if (teacherChanged) {
      // If dates/timings didn't change, surgically update teacher on all upcoming scheduled slots
      const futureScheds = await Schedule.find({ batch: updated._id, status: 'Scheduled' });
      for (const fs of futureScheds) {
        fs.teacher = targetTeacher;
        await fs.save();
      }
    }

    // Automatically sync assigned teacher to all enrolled students in this batch and record teacherHistory
    const batchIdStr = updated._id ? updated._id.toString() : '';
    const allStudents = await Student.find({});
    for (const st of allStudents) {
      const stBatchId = st.batch?._id ? st.batch._id.toString() : (st.batch ? st.batch.toString() : '');
      if (stBatchId === batchIdStr) {
        const currentTutor = st.assignedTutor?._id ? st.assignedTutor._id.toString() : (st.assignedTutor ? st.assignedTutor.toString() : '');
        if (teacherChanged && currentTutor !== targetTeacherStr && targetTeacherStr) {
          if (!st.teacherHistory || !Array.isArray(st.teacherHistory)) st.teacherHistory = [];
          st.teacherHistory.push({
            teacher: targetTeacherStr,
            teacherName: newTeacherName,
            previousTeacher: currentTutor || undefined,
            previousTeacherName: oldTeacherName || undefined,
            changedAt: new Date(),
            changedBy: (req as any).user?._id || undefined,
            reason: 'Batch assigned teacher changed',
          });
          st.assignedTutor = targetTeacher;
          await st.save();
        } else if (currentTutor !== targetTeacherStr) {
          st.assignedTutor = targetTeacher;
          await st.save();
        }
      }
    }

    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
    serverCache.clearPattern('students_');
    serverCache.clearPattern('timings_');
    serverCache.delete('teachers_all');
    deleteDiskCache('schedules_all');

    await updated.populate('assignedTeacher', 'name email');
    res.json(updated);
  } catch (error: any) {
    console.error('Update batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a batch + its auto-generated schedules
// @route   DELETE /batches/:id
// @access  Private/Admin
export const deleteBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id as string);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    // Capture all auto-generated schedules tied to this batch
    const schedules = await Schedule.find({ batch: batch._id });

    // Save batch and schedules snapshot to Recycle Bin
    await RecycleBin.addToBin({
      entityType: 'batch',
      entityId: batch._id,
      name: batch.name || 'Unnamed Batch',
      secondaryInfo: `${batch.subject || ''} • ${schedules.length} schedule(s)`,
      itemData: batch,
      associatedData: {
        schedules: schedules.map((s: any) => ({ ...s })),
      },
      deletedBy: req.user,
    });

    // Remove all auto-generated schedules tied to this batch
    await Schedule.deleteMany({ batch: batch._id });
    console.log(`🗑️  Archived and removed ${schedules.length} schedule(s) for deleted batch "${batch.name}"`);

    await Batch.deleteOne({ _id: batch._id });
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
    deleteDiskCache('schedules_all');
    res.json({ message: 'Batch and its schedules moved to Recycle Bin' });
  } catch (error: any) {
    console.error('Delete batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Get batch analytics (schedules, attendance, progress)
// @route   GET /batches/:id/analytics
// @access  Private
export const getBatchAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id as string).populate('assignedTeacher', 'name email');
    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    const students = await Student.find({ batch: batch._id });
    const schedules = await Schedule.find({ batch: batch._id }).sort({ date: 1 });

    const completedClasses = schedules.filter((s: any) => s.status === 'Completed');
    const cancelledClasses = schedules.filter((s: any) => s.status === 'Cancelled');
    const upcomingClasses = schedules.filter((s: any) => s.status === 'Scheduled');

    const preCompleted = Math.max(0, Number(batch.preCompletedClasses) || 0);
    const effectiveCompletedCount = Math.max(completedClasses.length, preCompleted);

    // Compute attendance statistics per student
    const attendanceStats = students.map((stu: any) => {
      let presentCount = 0;
      let totalCount = 0;

      completedClasses.forEach((cls: any) => {
        const record = cls.attendance?.find((a: any) => a.studentId?.toString() === stu._id.toString());
        if (record) {
          totalCount++;
          if (record.isPresent) presentCount++;
        } else {
          totalCount++;
          presentCount++;
        }
      });

      return {
        studentId: stu._id,
        name: stu.name,
        email: stu.email,
        phone: stu.mobileNumber || stu.phone,
        presentCount: Math.max(presentCount, effectiveCompletedCount),
        totalCount: Math.max(totalCount, effectiveCompletedCount),
        percentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
        projectSubmissions: stu.projectSubmissions || [],
      };
    });

    const targetSessions = (batch.numberOfSessions && Number(batch.numberOfSessions) > 0)
      ? Number(batch.numberOfSessions)
      : Math.max(schedules.length, effectiveCompletedCount);

    res.json({
      batch,
      studentsCount: students.length,
      totalSchedules: targetSessions,
      completedSchedules: effectiveCompletedCount,
      cancelledSchedules: cancelledClasses.length,
      upcomingSchedules: upcomingClasses.length,
      attendanceStats,
      students: students.map((s: any) => ({
        _id: s._id,
        name: s.name,
        email: s.email,
        phone: s.mobileNumber || s.phone,
        projectSubmissions: s.projectSubmissions || [],
      })),
      schedules,
    });
  } catch (error: any) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
