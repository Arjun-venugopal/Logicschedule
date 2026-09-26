import { Request, Response } from 'express';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import Teacher from '../models/Teacher';
import Student from '../models/Student';
import DemoSession from '../models/DemoSession';
import { checkIntervalConflict } from '../utils/scheduleHelper';
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

/**
 * Generate schedule entries for every matching class day starting from startDate.
 * If numberOfSessions is set, generates that exact number of classes.
 * Otherwise, generates schedules for 6 months (180 days) so classes are never cut off.
 * Detects conflicts with teacher's other batches and demo sessions in O(1) per date.
 */
async function generateSchedulesForBatch(batch: any, preCompletedClasses: number = 0): Promise<number> {
  const { _id, assignedTeacher, timing, days, meetingLink, startDate, numberOfSessions } = batch;

  if (!startDate || !days?.length || !timing?.startTime || !timing?.endTime) {
    return 0; // Not enough info to auto-generate
  }

  const cursor = normalizeDateOnlyToUtc(startDate);
  if (!cursor) return 0;

  const selectedDayIndexes = new Set((days as string[]).map((d) => DAY_INDEX[d]));

  // Pre-fetch all schedules for this batch from startDate onwards
  const existingSchedules = await Schedule.find({
    batch: _id,
    date: { $gte: cursor }
  }).select('date');

  const existingTimes = new Set(existingSchedules.map((s: any) => new Date(s.date).getTime()));

  // Pre-fetch teacher's other schedules and demo sessions to detect conflicts
  const teacherSlotsByDate = new Map<string, any[]>();
  if (assignedTeacher) {
    const teacherId = assignedTeacher._id ? assignedTeacher._id.toString() : assignedTeacher.toString();
    const [tScheds, tDemos] = await Promise.all([
      Schedule.find({ teacher: teacherId, date: { $gte: cursor }, status: { $ne: 'Cancelled' } }).select('date startTime endTime batch'),
      DemoSession.find({ teacher: teacherId, date: { $gte: cursor }, status: { $ne: 'Cancelled' } }).select('date startTime endTime')
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

  const schedulesToCreate: any[] = [];
  const targetSessions = numberOfSessions && Number(numberOfSessions) > 0 ? Number(numberOfSessions) : 0;
  const maxScanDays = 365;
  let daysScanned = 0;
  let matchingDaysCount = existingSchedules.length;

  while (daysScanned < maxScanDays) {
    if (targetSessions > 0 && matchingDaysCount >= targetSessions) {
      break;
    }
    if (targetSessions === 0 && daysScanned >= 180) {
      break;
    }

    if (selectedDayIndexes.has(cursor.getUTCDay())) {
      const cursorTime = cursor.getTime();

      if (!existingTimes.has(cursorTime)) {
        const isCompleted = schedulesToCreate.length < preCompletedClasses;
        const dateKey = cursor.toISOString().split('T')[0];
        const daySlots = teacherSlotsByDate.get(dateKey) || [];
        const isConflict = checkIntervalConflict(daySlots, {
          startTime: timing.startTime,
          endTime: timing.endTime,
        });

        const newSlot = {
          teacher: assignedTeacher || undefined,
          batch: _id,
          date: new Date(cursorTime),
          startTime: timing.startTime,
          endTime: timing.endTime,
          status: isCompleted ? 'Completed' : 'Scheduled',
          conflict: isConflict,
          meetingLink: meetingLink || '',
          notes: isCompleted ? `Auto-generated as Completed (Late join)` : `Auto-generated for batch`,
        };

        schedulesToCreate.push(newSlot);
        existingTimes.add(cursorTime);
        daySlots.push(newSlot);
        teacherSlotsByDate.set(dateKey, daySlots);
      }
      matchingDaysCount++;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    daysScanned++;
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
    const totalCountMap: Record<string, number> = {};
    const lastCompletedDateMap: Record<string, Date> = {};

    allSchedules.forEach((s: any) => {
      const bId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
      if (!bId) return;
      totalCountMap[bId] = (totalCountMap[bId] || 0) + 1;
      if (s.status === 'Completed') {
        completedCountMap[bId] = (completedCountMap[bId] || 0) + 1;
        if (s.date) {
          const sDate = new Date(s.date);
          if (!isNaN(sDate.getTime()) && (!lastCompletedDateMap[bId] || sDate > lastCompletedDateMap[bId])) {
            lastCompletedDateMap[bId] = sDate;
          }
        }
      }
    });

    const enrichedBatches = batches.map((b: any) => {
      const batchObj = b.toObject ? b.toObject() : b;
      const bId = batchObj._id.toString();
      const completedCount = completedCountMap[bId] || 0;
      const totalCount = totalCountMap[bId] || 0;

      return {
        ...batchObj,
        completedClassesCount: completedCount,
        totalClassesCount: totalCount
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
      startDate, durationType, status, numberOfSessions, preCompletedClasses
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
      (req.body.timing !== undefined);

    batch.name = req.body.name ?? batch.name;
    batch.subject = req.body.subject ?? batch.subject;
    batch.assignedTeacher = req.body.assignedTeacher || batch.assignedTeacher;
    batch.studentsCount = req.body.studentsCount ?? batch.studentsCount;
    batch.timing = req.body.timing ?? batch.timing;
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
      await Schedule.deleteMany({ batch: batch._id, notes: { $regex: /Auto-generated/ } });
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
export const deleteBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id as string);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    // Remove all auto-generated schedules tied to this batch
    await Schedule.deleteMany({ batch: batch._id });
    console.log(`🗑️  Removed schedule(s) for deleted batch "${batch.name}"`);

    await Batch.deleteOne({ _id: batch._id });
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('schedules_');
    deleteDiskCache('schedules_all');
    res.json({ message: 'Batch and its schedules removed' });
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

    // Compute attendance statistics per student
    const attendanceStats = students.map((stu: any) => {
      let presentCount = 0;
      let totalCount = 0;

      completedClasses.forEach((cls: any) => {
        const record = cls.attendance?.find((a: any) => a.studentId?.toString() === stu._id.toString());
        if (record) {
          totalCount++;
          if (record.isPresent) presentCount++;
        }
      });

      return {
        studentId: stu._id,
        name: stu.name,
        presentCount,
        totalCount,
        percentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
      };
    });

    res.json({
      batch,
      studentsCount: students.length,
      totalSchedules: schedules.length,
      completedSchedules: completedClasses.length,
      attendanceStats,
      schedules,
    });
  } catch (error: any) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
