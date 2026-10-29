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
  
  const dayTimings = batch.dayTimings;
  if (dayTimings && typeof dayTimings === 'object' && dayTimings[dayName]?.startTime) {
    const sTime = dayTimings[dayName].startTime;
    const eTime = dayTimings[dayName].endTime || computeEndTime(sTime, 60);
    return { startTime: sTime, endTime: eTime };
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
  studentId?: string
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

  const preCompletedClasses = Math.max(0, Number(rawPreCompletedClasses) || Number(batch.preCompletedClasses) || 0);
  const targetSessions = numberOfSessions && Number(numberOfSessions) > 0 ? Number(numberOfSessions) : 0;
  const selectedDayIndexes = new Set((days as string[]).map((d) => DAY_INDEX[d]));

  const kolkata = getKolkataNow();
  const todayEnd = new Date(`${kolkata.todayStr}T23:59:59.999Z`);
  const todayUtc = normalizeDateOnlyToUtc(kolkata.todayStr)!;

  // Pre-fetch all schedules for this batch
  const existingSchedules = await Schedule.find({ batch: _id });
  const existingTimes = new Set(existingSchedules.map((s: any) => new Date(s.date).getTime()));
  const existingCompletedCount = existingSchedules.filter((s: any) => s.status === 'Completed').length;

  // Pre-fetch teacher's other schedules and demo sessions to detect conflicts
  const teacherSlotsByDate = new Map<string, any[]>();
  if (assignedTeacher) {
    const teacherId = assignedTeacher._id ? assignedTeacher._id.toString() : assignedTeacher.toString();
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

  // Step 1: If preCompletedClasses > 0 and we need more completed schedules:
  // Generate neededCompleted schedules in the past (dates <= todayStr)
  if (neededCompleted > 0) {
    const baseTimestamp = Math.min(cursor.getTime(), todayEnd.getTime());
    const backCursor = new Date(baseTimestamp);
    let backDaysScanned = 0;

    while (schedulesToCreate.length < neededCompleted && backDaysScanned < 365) {
      if (selectedDayIndexes.has(backCursor.getUTCDay())) {
        const backTime = backCursor.getTime();
        const dateKey = backCursor.toISOString().split('T')[0];

        if (dateKey <= kolkata.todayStr && !existingTimes.has(backTime)) {
          const daySlots = teacherSlotsByDate.get(dateKey) || [];
          const slotTiming = getSlotTimingForDay(batch, backTime);
          const isConflict = checkIntervalConflict(daySlots, {
            startTime: slotTiming.startTime,
            endTime: slotTiming.endTime,
          });

          const completedSlot = {
            teacher: assignedTeacher || undefined,
            batch: _id,
            date: new Date(backTime),
            startTime: slotTiming.startTime,
            endTime: slotTiming.endTime,
            status: 'Completed',
            conflict: isConflict,
            meetingLink: meetingLink || '',
            notes: 'Auto-generated as Completed (Classes Already Completed)',
            attendance: batchStudentIds.map((sId) => ({
              studentId: sId,
              isPresent: true,
              date: new Date(backTime),
            })),
          };

          schedulesToCreate.unshift(completedSlot); // Keep in chronological order
          existingTimes.add(backTime);
          daySlots.push(completedSlot);
          teacherSlotsByDate.set(dateKey, daySlots);
        }
      }
      backCursor.setUTCDate(backCursor.getUTCDate() - 1);
      backDaysScanned++;
    }

    // Fallback: If matching days were not sufficient in past, fill remaining completed classes on preceding days
    let fallbackOffset = 1;
    while (schedulesToCreate.length < neededCompleted && fallbackOffset <= 365) {
      const fbDate = new Date(baseTimestamp - fallbackOffset * 86400000);
      const fbTime = fbDate.getTime();
      const fbDateKey = fbDate.toISOString().split('T')[0];
      if (fbDateKey <= kolkata.todayStr && !existingTimes.has(fbTime)) {
        const slotTiming = getSlotTimingForDay(batch, fbTime);
        const completedSlot = {
          teacher: assignedTeacher || undefined,
          batch: _id,
          date: new Date(fbTime),
          startTime: slotTiming.startTime,
          endTime: slotTiming.endTime,
          status: 'Completed',
          conflict: false,
          meetingLink: meetingLink || '',
          notes: 'Auto-generated as Completed (Classes Already Completed)',
          attendance: batchStudentIds.map((sId) => ({
            studentId: sId,
            isPresent: true,
            date: new Date(fbTime),
          })),
        };
        schedulesToCreate.unshift(completedSlot);
        existingTimes.add(fbTime);
      }
      fallbackOffset++;
    }
  }

  // Step 2: Generate remaining upcoming/scheduled classes forward
  // Strictly start forward from today or startDate (whichever is later) so upcoming classes
  // are never placed in the past!
  const totalCompletedSoFar = existingCompletedCount + schedulesToCreate.length;
  const forwardStartTime = Math.max(cursor.getTime(), todayUtc.getTime());
  const forwardCursor = new Date(forwardStartTime);
  let forwardDaysScanned = 0;
  let scheduledCount = existingSchedules.filter((s: any) => s.status === 'Scheduled').length;
  const maxScanDays = 365;

  while (forwardDaysScanned < maxScanDays) {
    if (targetSessions > 0 && (totalCompletedSoFar + scheduledCount) >= targetSessions) {
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

        const newSlot = {
          teacher: assignedTeacher || undefined,
          batch: _id,
          date: new Date(forwardTime),
          startTime: slotTiming.startTime,
          endTime: slotTiming.endTime,
          status: 'Scheduled',
          conflict: isConflict,
          meetingLink: meetingLink || '',
          notes: 'Auto-generated for batch',
          attendance: batchStudentIds.map((sId) => ({ studentId: sId, isPresent: false, date: new Date(forwardTime) })),
        };

        schedulesToCreate.push(newSlot);
        existingTimes.add(forwardTime);
        daySlots.push(newSlot);
        teacherSlotsByDate.set(dateKey, daySlots);
        scheduledCount++;
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
      preCompletedClasses: preCompletedClasses || 0,
    });

    // Auto-generate calendar schedules for classes based on numberOfSessions or rolling window
    const generated = await generateSchedulesForBatch(batch, preCompletedClasses || 0);
    console.log(`✅ Auto-generated ${generated} schedule(s) for batch "${name}"`);

    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
    deleteDiskCache('schedules_all');

    const populated = await batch.populate('assignedTeacher', 'name email');
    res.status(201).json({ ...(populated.toObject ? populated.toObject() : populated), schedulesGenerated: generated });
  } catch (error: any) {
    console.error('Create batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a batch + regenerate schedules if dates/days changed
// @route   PUT /batches/:id
// @access  Private/Admin
export const updateBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id as string);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    const datesChanged =
      (req.body.startDate !== undefined && String(req.body.startDate) !== String(batch.startDate)) ||
      (req.body.days !== undefined && JSON.stringify(req.body.days) !== JSON.stringify(batch.days)) ||
      (req.body.numberOfSessions !== undefined && req.body.numberOfSessions !== batch.numberOfSessions) ||
      (req.body.timing !== undefined || req.body.dayTimings !== undefined || req.body.timeMode !== undefined) ||
      (req.body.preCompletedClasses !== undefined && Number(req.body.preCompletedClasses) !== Number(batch.preCompletedClasses));

    batch.name = req.body.name ?? batch.name;
    batch.subject = req.body.subject ?? batch.subject;
    batch.assignedTeacher = req.body.assignedTeacher || batch.assignedTeacher;
    batch.studentsCount = req.body.studentsCount ?? batch.studentsCount;
    batch.timing = req.body.timing ?? batch.timing;
    batch.dayTimings = req.body.dayTimings ?? batch.dayTimings;
    batch.timeMode = req.body.timeMode ?? batch.timeMode;
    batch.days = req.body.days ?? batch.days;
    batch.meetingLink = req.body.meetingLink ?? batch.meetingLink;
    batch.durationType = req.body.durationType ?? batch.durationType;
    batch.status = req.body.status ?? batch.status;
    batch.numberOfSessions = req.body.numberOfSessions !== undefined ? req.body.numberOfSessions : batch.numberOfSessions;
    batch.preCompletedClasses = req.body.preCompletedClasses !== undefined ? req.body.preCompletedClasses : batch.preCompletedClasses;

    if (req.body.startDate !== undefined)
      batch.startDate = normalizeDateOnlyToUtc(req.body.startDate);

    const updated = await batch.save();

    // If dates/days/timing changed, delete old auto-generated schedules and regenerate
    if (datesChanged) {
      // Delete ONLY future scheduled classes (preserving all historical attendance and completed records!)
      const kolkata = getKolkataNow();
      const todayStart = new Date(`${kolkata.todayStr}T00:00:00.000Z`);
      await Schedule.deleteMany({
        batch: batch._id,
        status: 'Scheduled',
        date: { $gte: todayStart }
      });
      const generated = await generateSchedulesForBatch(updated, updated.preCompletedClasses || 0);
      console.log(`🔄 Regenerated ${generated} schedule(s) for batch "${updated.name}"`);
    }

    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
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
