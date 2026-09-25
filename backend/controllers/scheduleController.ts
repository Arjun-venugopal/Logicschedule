import { Request, Response } from 'express';
import Schedule from '../models/Schedule';
import Batch from '../models/Batch';
import Teacher from '../models/Teacher';
import Student from '../models/Student';
import { checkIntervalConflict } from '../utils/scheduleHelper';
import { serverCache, saveDiskCache, readDiskCache, deleteDiskCache } from '../utils/cache';

// @desc    Get all schedules
// @route   GET /schedules
// @access  Private
export const getSchedules = async (req: any, res: Response) => {
  const isTeacher = req.user && req.user.role === 'Teacher';
  const cacheKey = isTeacher ? `schedules_teacher_${req.user._id}` : 'schedules_all';

  try {
    const cached = serverCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    let schedules: any[] = [];

    // If logged in user is a Teacher, only fetch their schedules using indexed queries
    if (isTeacher) {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) {
        // Query teacher and replacementTeacher using native Firestore indexed queries instead of scanning all documents
        const [primarySchedules, replacementSchedules] = await Promise.all([
          Schedule.find({ teacher: teacher._id })
            .sort({ date: -1 })
            .populate('teacher', 'name email')
            .populate('batch', 'name subject')
            .populate('replacementTeacher', 'name email'),
          Schedule.find({ replacementTeacher: teacher._id })
            .sort({ date: -1 })
            .populate('teacher', 'name email')
            .populate('batch', 'name subject')
            .populate('replacementTeacher', 'name email')
        ]);

        const map = new Map<string, any>();
        primarySchedules.forEach((s: any) => map.set(s._id.toString(), s));
        replacementSchedules.forEach((s: any) => map.set(s._id.toString(), s));
        schedules = Array.from(map.values()).sort((a: any, b: any) => {
          const tA = a.date ? new Date(a.date).getTime() : 0;
          const tB = b.date ? new Date(b.date).getTime() : 0;
          return tB - tA;
        });
      } else {
        res.json([]);
        return;
      }
    } else {
      schedules = await Schedule.find({})
        .sort({ date: -1 })
        .populate('teacher', 'name email')
        .populate('batch', 'name subject')
        .populate('replacementTeacher', 'name email');
    }

    // Cache schedules in memory and persistent disk
    serverCache.set(cacheKey, schedules, 60_000);
    saveDiskCache(cacheKey, schedules);
    if (!isTeacher) {
      saveDiskCache('schedules_all', schedules);
    }
    res.json(schedules);
  } catch (error: any) {
    console.error('Get schedules error:', error.message);
    // Graceful fallback to stale cache or disk cache if quota is exhausted or temporary connection error
    let fallback = serverCache.getStale ? serverCache.getStale(cacheKey) : serverCache.get(cacheKey);
    if (!fallback) {
      fallback = readDiskCache(cacheKey);
    }
    if (!fallback && isTeacher) {
      const allSchedules: any = readDiskCache('schedules_all');
      if (Array.isArray(allSchedules)) {
        fallback = allSchedules.filter((s: any) =>
          (s.teacher?._id || s.teacher) === req.user._id ||
          (s.replacementTeacher?._id || s.replacementTeacher) === req.user._id
        );
      }
    }

    if (fallback) {
      console.warn('Returning cached fallback schedules due to error/quota:', error.message);
      res.json(fallback);
      return;
    }
    res.status(500).json({ message: 'Server error: database quota temporarily reached. Please try again shortly.' });
  }
};

import { normalizeDateOnlyToUtc } from './batchController';

// @desc    Create a schedule
// @route   POST /schedules
// @access  Private/Admin
export const createSchedule = async (req: any, res: Response): Promise<void> => {
  try {
    const { teacher, batch, date, startTime, endTime, status, replacementTeacher, meetingLink, subject, notes } = req.body;

    if (!teacher || !batch || !date || !startTime || !endTime) {
      res.status(400).json({ message: 'Please provide teacher, batch, date, startTime and endTime' });
      return;
    }

    const normalizedDate = normalizeDateOnlyToUtc(date) || new Date(date);

    // Check for interval conflict on the same teacher and date
    const existingTeacherSchedules = await Schedule.find({
      teacher,
      date: normalizedDate,
      status: { $ne: 'Cancelled' }
    }).select('_id startTime endTime status');

    const isConflict = checkIntervalConflict(existingTeacherSchedules, { startTime, endTime });

    const schedule = await Schedule.create({
      teacher,
      batch,
      date: normalizedDate,
      startTime,
      endTime,
      status: status || 'Scheduled',
      replacementTeacher,
      conflict: isConflict,
      meetingLink: meetingLink || '',
      subject: subject || '',
      notes: notes || '',
      cancellationReason: req.body.cancellationReason || '',
    });

    const populated = await schedule.populate([
      { path: 'teacher', select: 'name email' },
      { path: 'batch', select: 'name subject' },
    ]);

    serverCache.clearPattern('timings_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('schedules_');
    deleteDiskCache('schedules_all');

    res.status(201).json(populated);
  } catch (error: any) {
    console.error('Create schedule error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a schedule
// @route   PUT /schedules/:id
// @access  Private
export const updateSchedule = async (req: any, res: Response): Promise<void> => {
  try {
    const schedule = await Schedule.findById(req.params.id as string);

    if (schedule) {
      const isAdmin = req.user.role === 'Admin' || req.user.role === 'Super Admin' || req.user.role === 'Sub Admin';
      let isAssignedTeacher = false;
      
      const teacherProfile = await Teacher.findOne({ user: req.user._id });
      if (teacherProfile) {
        const schedTeacherId = (schedule.teacher?._id || schedule.teacher)?.toString();
        const schedReplId = schedule.replacementTeacher ? (schedule.replacementTeacher?._id || schedule.replacementTeacher)?.toString() : null;
        if (schedTeacherId === teacherProfile._id.toString() || (schedReplId && schedReplId === teacherProfile._id.toString())) {
          isAssignedTeacher = true;
        }
      }

      if (!isAdmin && !isAssignedTeacher) {
        res.status(403).json({ message: 'Not authorized to update this schedule' });
        return;
      }

      if (isAdmin) {
        schedule.teacher = req.body.teacher || schedule.teacher;
        schedule.batch = req.body.batch || schedule.batch;
        schedule.date = req.body.date ? (normalizeDateOnlyToUtc(req.body.date) || schedule.date) : schedule.date;
        schedule.startTime = req.body.startTime || schedule.startTime;
        schedule.endTime = req.body.endTime || schedule.endTime;
        schedule.status = req.body.status || schedule.status;
        schedule.replacementTeacher = req.body.replacementTeacher || schedule.replacementTeacher;
        schedule.conflict = req.body.conflict !== undefined ? req.body.conflict : schedule.conflict;
        if (req.body.meetingLink !== undefined) schedule.meetingLink = req.body.meetingLink;
        if (req.body.subject !== undefined) (schedule as any).subject = req.body.subject;
        if (req.body.notes !== undefined) schedule.notes = req.body.notes;
        if (req.body.attendance !== undefined) {
          (schedule as any).attendance = req.body.attendance;
        }
        if (req.body.cancellationReason !== undefined) {
          (schedule as any).cancellationReason = req.body.cancellationReason;
        }
      } else {
        // Teacher edits: only allowed to change status, subject, completed class note (notes), meetingLink, attendance, and cancellationReason
        if (req.body.status !== undefined) schedule.status = req.body.status;
        if (req.body.subject !== undefined) (schedule as any).subject = req.body.subject;
        if (req.body.notes !== undefined) schedule.notes = req.body.notes;
        if (req.body.meetingLink !== undefined) schedule.meetingLink = req.body.meetingLink;
        if (req.body.attendance !== undefined) {
          (schedule as any).attendance = req.body.attendance;
        }
        if (req.body.cancellationReason !== undefined) {
          (schedule as any).cancellationReason = req.body.cancellationReason;
        }
      }

      const updatedSchedule = await schedule.save();

      // Sync batch status if all classes are completed
      if (updatedSchedule.batch) {
        try {
          const batchId = updatedSchedule.batch?._id ? updatedSchedule.batch._id : updatedSchedule.batch;
          const batch = await Batch.findById(batchId.toString());
          if (batch) {
            const allBatchSchedules = await Schedule.find({ batch: batch._id });
            const allCompleted = allBatchSchedules.length > 0 &&
              allBatchSchedules.every((s: any) => s.status === 'Completed');

            if (allCompleted && batch.status !== 'Completed') {
              batch.status = 'Completed';
              await batch.save();
            }
          }
        } catch (err: any) {
          console.error('[updateSchedule] Error syncing batch status:', err.message);
        }
      }

      serverCache.clearPattern('timings_');
      serverCache.clearPattern('stats_');
      serverCache.clearPattern('batches_');
      serverCache.clearPattern('schedules_');
      deleteDiskCache('schedules_all');

      res.json(updatedSchedule);
    } else {
      res.status(404).json({ message: 'Schedule not found' });
    }
  } catch (error: any) {
    console.error('Update schedule error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a schedule
// @route   DELETE /schedules/:id
// @access  Private/Admin
export const deleteSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const schedule = await Schedule.findById(req.params.id as string);

    if (schedule) {
      await Schedule.deleteOne({ _id: schedule._id });
      serverCache.clearPattern('timings_');
      serverCache.clearPattern('stats_');
      serverCache.clearPattern('batches_');
      serverCache.clearPattern('schedules_');
      deleteDiskCache('schedules_all');
      res.json({ message: 'Schedule removed' });
    } else {
      res.status(404).json({ message: 'Schedule not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get schedules by student ID
// @route   GET /schedules/student/:studentId
// @access  Private
export const getSchedulesByStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    const student = await Student.findById(studentId);
    if (!student) {
      res.json([]);
      return;
    }

    const batchIds: string[] = [];
    if (student.batch) {
      const bId = typeof student.batch === 'object' ? student.batch._id : student.batch;
      if (bId) batchIds.push(bId.toString());
    }
    if (student.pastBatches && Array.isArray(student.pastBatches)) {
      student.pastBatches.forEach((pb: any) => {
        const pbId = typeof pb.batch === 'object' ? pb.batch?._id : pb.batch;
        if (pbId) batchIds.push(pbId.toString());
      });
    }

    let matchingSchedules: any[] = [];
    if (batchIds.length > 0) {
      const batchSchedules = await Schedule.find({
        batch: { $in: batchIds },
        status: 'Completed'
      })
        .populate('teacher', 'name email')
        .populate('batch', 'name subject');

      matchingSchedules = batchSchedules.filter((s: any) => {
        if (!s.attendance || !Array.isArray(s.attendance)) return false;
        return s.attendance.some((a: any) => {
          const id = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
          return id === studentId;
        });
      });
    }

    res.json(matchingSchedules);
  } catch (error) {
    console.error('Error fetching student schedules:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
