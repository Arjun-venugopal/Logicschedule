import { Request, Response } from 'express';
import Schedule from '../models/Schedule';
import Teacher from '../models/Teacher';
import Student from '../models/Student';
import { checkIntervalConflict } from '../utils/scheduleHelper';

// @desc    Get all schedules
// @route   GET /schedules
// @access  Private
export const getSchedules = async (req: any, res: Response) => {
  try {
    let query: any = {};

    // If logged in user is a Teacher, only fetch their schedules
    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) {
        query = {
          $or: [
            { teacher: teacher._id },
            { replacementTeacher: teacher._id }
          ]
        };
      } else {
        res.json([]);
        return;
      }
    }

    const schedules = await Schedule.find(query)
      .sort({ date: -1 })
      .populate('teacher', 'name email')
      .populate('batch', 'name subject')
      .populate('replacementTeacher', 'name email');
    res.json(schedules);
  } catch (error: any) {
    console.error('Get schedules error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

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

    // Check for interval conflict on the same teacher and date
    const existingTeacherSchedules = await Schedule.find({
      teacher,
      date: new Date(date),
      status: { $ne: 'Cancelled' }
    }).select('_id startTime endTime status');

    const isConflict = checkIntervalConflict(existingTeacherSchedules, { startTime, endTime });

    const schedule = await Schedule.create({
      teacher,
      batch,
      date,
      startTime,
      endTime,
      status: status || 'Scheduled',
      replacementTeacher,
      conflict: isConflict,
      meetingLink: meetingLink || '',
      subject: subject || '',
      notes: notes || '',
    });

    const populated = await schedule.populate([
      { path: 'teacher', select: 'name email' },
      { path: 'batch', select: 'name subject' },
    ]);

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
    console.log(`[updateSchedule] Attempting to update schedule ${req.params.id as string}`);
    console.log(`[updateSchedule] Payload:`, JSON.stringify(req.body, null, 2));

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

      console.log(`[updateSchedule] User role: ${req.user.role}, isAdmin: ${isAdmin}, isAssignedTeacher: ${isAssignedTeacher}`);

      if (!isAdmin && !isAssignedTeacher) {
        console.log(`[updateSchedule] Not authorized!`);
        res.status(403).json({ message: 'Not authorized to update this schedule' });
        return;
      }

      if (isAdmin) {
        schedule.teacher = req.body.teacher || schedule.teacher;
        schedule.batch = req.body.batch || schedule.batch;
        schedule.date = req.body.date || schedule.date;
        schedule.startTime = req.body.startTime || schedule.startTime;
        schedule.endTime = req.body.endTime || schedule.endTime;
        schedule.status = req.body.status || schedule.status;
        schedule.replacementTeacher = req.body.replacementTeacher || schedule.replacementTeacher;
        schedule.conflict = req.body.conflict !== undefined ? req.body.conflict : schedule.conflict;
        if (req.body.meetingLink !== undefined) schedule.meetingLink = req.body.meetingLink;
        if (req.body.subject !== undefined) (schedule as any).subject = req.body.subject;
        if (req.body.notes !== undefined) schedule.notes = req.body.notes;
        if (req.body.attendance !== undefined) {
          console.log(`[updateSchedule] Admin updating attendance:`, req.body.attendance);
          (schedule as any).attendance = req.body.attendance;
        }
      } else {
        // Teacher edits: only allowed to change status, subject, completed class note (notes), meetingLink, and attendance
        if (req.body.status !== undefined) schedule.status = req.body.status;
        if (req.body.subject !== undefined) (schedule as any).subject = req.body.subject;
        if (req.body.notes !== undefined) schedule.notes = req.body.notes;
        if (req.body.meetingLink !== undefined) schedule.meetingLink = req.body.meetingLink;
        if (req.body.attendance !== undefined) {
          console.log(`[updateSchedule] Teacher updating attendance:`, req.body.attendance);
          (schedule as any).attendance = req.body.attendance;
        }
      }

      console.log(`[updateSchedule] Saving schedule...`);
      const updatedSchedule = await schedule.save();
      console.log(`[updateSchedule] Save successful.`);
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
