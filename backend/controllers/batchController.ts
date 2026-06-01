import { Request, Response } from 'express';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';

// Day name → JS getDay() index
const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * Generate schedule entries for every matching class day between startDate and endDate.
 * Skips days that already have a schedule for the same batch+date.
 */
async function generateSchedulesForBatch(batch: any): Promise<number> {
  const { _id, assignedTeacher, timing, days, meetingLink, startDate, endDate } = batch;

  if (!startDate || !endDate || !days?.length || !timing?.startTime || !timing?.endTime) {
    return 0; // Not enough info to auto-generate
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const selectedDayIndexes = (days as string[]).map((d) => DAY_INDEX[d]);

  // Pre-fetch all schedules for this batch in the date range to avoid N+1 queries in the loop
  const existingSchedules = await Schedule.find({
    batch: _id,
    date: { $gte: start, $lte: end }
  }).select('date');

  const existingTimes = new Set(existingSchedules.map((s: any) => new Date(s.date).getTime()));

  const schedulesToCreate: any[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    if (selectedDayIndexes.includes(cursor.getDay())) {
      const cursorTime = new Date(cursor).getTime();

      if (!existingTimes.has(cursorTime)) {
        schedulesToCreate.push({
          teacher: assignedTeacher || undefined,
          batch: _id,
          date: new Date(cursor),
          startTime: timing.startTime,
          endTime: timing.endTime,
          status: 'Scheduled',
          meetingLink: meetingLink || '',
          notes: `Auto-generated for batch`,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (schedulesToCreate.length > 0) {
    await Schedule.insertMany(schedulesToCreate);
  }

  return schedulesToCreate.length;
}

// @desc    Get all batches
// @route   GET /batches
// @access  Private
import Teacher from '../models/Teacher'; // ensure imported at top if not there

export const getBatches = async (req: any, res: Response) => {
  try {
    let query: any = {};
    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) query = { assignedTeacher: teacher._id };
      else { res.json([]); return; }
    }
    const batches = await Batch.find(query).populate('assignedTeacher', 'name email');
    res.json(batches);
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
      startDate, endDate, durationType, status,
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
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      durationType: durationType || '1 Month',
      status: status || 'Upcoming',
    });

    // Auto-generate calendar schedules for every class day in the duration
    const generated = await generateSchedulesForBatch(batch);
    console.log(`✅ Auto-generated ${generated} schedule(s) for batch "${name}"`);

    const populated = await batch.populate('assignedTeacher', 'name email');
    res.status(201).json({ ...populated.toObject(), schedulesGenerated: generated });
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
    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    const datesChanged =
      (req.body.startDate !== undefined && String(req.body.startDate) !== String(batch.startDate)) ||
      (req.body.endDate   !== undefined && String(req.body.endDate)   !== String(batch.endDate))   ||
      (req.body.days      !== undefined && JSON.stringify(req.body.days) !== JSON.stringify(batch.days)) ||
      (req.body.timing    !== undefined);

    batch.name            = req.body.name ?? batch.name;
    batch.subject         = req.body.subject ?? batch.subject;
    batch.assignedTeacher = req.body.assignedTeacher || batch.assignedTeacher;
    batch.studentsCount   = req.body.studentsCount ?? batch.studentsCount;
    batch.timing          = req.body.timing ?? batch.timing;
    batch.days            = req.body.days ?? batch.days;
    batch.meetingLink     = req.body.meetingLink ?? batch.meetingLink;
    batch.durationType    = req.body.durationType ?? batch.durationType;
    batch.status          = req.body.status ?? batch.status;

    if (req.body.startDate !== undefined)
      batch.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
    if (req.body.endDate !== undefined)
      batch.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;

    const updated = await batch.save();

    // If dates/days/timing changed, delete old auto-generated schedules and regenerate
    if (datesChanged) {
      await Schedule.deleteMany({ batch: batch._id, notes: 'Auto-generated for batch' });
      const generated = await generateSchedulesForBatch(updated);
      console.log(`🔄 Regenerated ${generated} schedule(s) for batch "${updated.name}"`);
    }

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
    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    // Remove all auto-generated schedules tied to this batch
    const deleted = await Schedule.deleteMany({ batch: batch._id });
    console.log(`🗑️  Removed ${deleted.deletedCount} schedule(s) for deleted batch "${batch.name}"`);

    await Batch.deleteOne({ _id: batch._id });
    res.json({ message: 'Batch and its schedules removed' });
  } catch (error: any) {
    console.error('Delete batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

import Student from '../models/Student';

// @desc    Get batch analytics (schedules, attendance, progress)
// @route   GET /batches/:id/analytics
// @access  Private
export const getBatchAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id).populate('assignedTeacher', 'name email');
    if (!batch) {
      res.status(404).json({ message: 'Batch not found' });
      return;
    }

    const students = await Student.find({ batch: batch._id });
    const schedules = await Schedule.find({ batch: batch._id }).sort({ date: 1 });

    const completedClasses = schedules.filter(s => s.status === 'Completed');
    
    // Compute attendance statistics per student
    const attendanceStats = students.map((stu) => {
      let presentCount = 0;
      let totalCount = 0;
      
      completedClasses.forEach(cls => {
        const record = cls.attendance?.find(a => a.studentId?.toString() === stu._id.toString());
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
