import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Teacher from '../models/Teacher';
import User from '../models/User';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';

// @desc    Get all teachers
// @route   GET /teachers
// @access  Private
export const getTeachers = async (req: Request, res: Response) => {
  try {
    const teachers = await Teacher.find({}).populate('user', 'name email role mustChangePassword');
    res.json(teachers);
  } catch (error: any) {
    console.error('Get teachers error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Create a teacher directly (also creates login User)
// @route   POST /teachers
// @access  Private/Admin
export const createTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, subjectExpertise, experience, status, tempPassword } = req.body;

    if (!name || !email) {
      res.status(400).json({ message: 'Name and email are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    // Create or find login User
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({
        name,
        email: normalizedEmail,
        password: tempPassword || 'Temp@1234',
        role: 'Teacher',
        mustChangePassword: true,
      });
    }

    // Check for duplicate Teacher profile
    const teacherExists = await Teacher.findOne({ email: normalizedEmail });
    if (teacherExists) {
      res.status(400).json({ message: 'Teacher profile with this email already exists' });
      return;
    }

    const teacher = await Teacher.create({
      user: user._id,
      name,
      email: normalizedEmail,
      phone: phone || '',
      subjectExpertise: subjectExpertise || [],
      experience: experience || 0,
      status: status || 'Available',
    });

    const populated = await teacher.populate('user', 'name email role');
    res.status(201).json(populated);
  } catch (error: any) {
    console.error('Create teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a teacher
// @route   PUT /teachers/:id
// @access  Private/Admin
export const updateTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' });
      return;
    }

    teacher.name              = req.body.name ?? teacher.name;
    teacher.phone             = req.body.phone ?? teacher.phone;
    teacher.subjectExpertise  = req.body.subjectExpertise ?? teacher.subjectExpertise;
    teacher.experience        = req.body.experience ?? teacher.experience;
    teacher.status            = req.body.status ?? teacher.status;
    teacher.availability      = req.body.availability ?? teacher.availability;
    teacher.workloadPercentage = req.body.workloadPercentage ?? teacher.workloadPercentage;

    const updated = await teacher.save();
    res.json(updated);
  } catch (error: any) {
    console.error('Update teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a teacher
// @route   DELETE /teachers/:id
// @access  Private/Admin
export const deleteTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' });
      return;
    }

    await Teacher.deleteOne({ _id: teacher._id });
    res.json({ message: 'Teacher removed' });
  } catch (error: any) {
    console.error('Delete teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Get current teacher's profile
// @route   GET /teachers/profile
// @access  Private (Teacher only)
export const getTeacherProfile = async (req: any, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findOne({ user: req.user._id }).populate('user', 'name email role');
    if (!teacher) {
      res.status(404).json({ message: 'Teacher profile not found' });
      return;
    }
    res.json(teacher);
  } catch (error: any) {
    console.error('Get teacher profile error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update current teacher's profile/availability
// @route   PUT /teachers/profile
// @access  Private (Teacher only)
export const updateTeacherProfile = async (req: any, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findOne({ user: req.user._id });
    if (!teacher) {
      res.status(404).json({ message: 'Teacher profile not found' });
      return;
    }

    if (req.body.phone !== undefined) teacher.phone = req.body.phone;
    if (req.body.status !== undefined) teacher.status = req.body.status;
    if (req.body.availability !== undefined) teacher.availability = req.body.availability;

    const updated = await teacher.save();
    res.json(updated);
  } catch (error: any) {
    console.error('Update teacher profile error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Get teacher performance metrics
// @route   GET /teachers/:id/performance
// @access  Private (Teacher or Admin)
export const getTeacherPerformance = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    let teacher: any = null;

    if (id === 'me' || id === 'self') {
      teacher = await Teacher.findOne({ user: req.user._id });
    } else {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid teacher ID format' });
        return;
      }
      teacher = await Teacher.findById(id);
    }

    if (!teacher) {
      res.status(404).json({ message: 'Teacher profile not found' });
      return;
    }

    // Check authorization: Admin can see anything, Teacher can only see their own performance
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      if (teacher.user.toString() !== req.user._id.toString()) {
        res.status(403).json({ message: 'Forbidden: You can only view your own performance' });
        return;
      }
    }

    const totalBatches = await Batch.countDocuments({ assignedTeacher: teacher._id });

    // Fetch all schedules for this teacher to compute metrics in-memory
    const allSchedulesList = await Schedule.find({ teacher: teacher._id });
    const totalSchedules = allSchedulesList.length;
    const completedSchedulesList = allSchedulesList.filter((s: any) => s.status === 'Completed');
    const completedClasses = completedSchedulesList.length;
    const cancelledClasses = allSchedulesList.filter((s: any) => s.status === 'Cancelled').length;
    const completionRate = totalSchedules > 0 ? Math.round((completedClasses / totalSchedules) * 100) : 0;
    let totalHoursTaught = 0;
    completedSchedulesList.forEach((s: any) => {
      if (s.startTime && s.endTime) {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        let diff = (eh + em / 60) - (sh + sm / 60);
        if (diff < 0) diff += 24; // Handle shift spanning midnight
        totalHoursTaught += diff;
      }
    });
    totalHoursTaught = Math.round(totalHoursTaught * 10) / 10;

    let totalPresent = 0;
    let totalEnrolled = 0;
    completedSchedulesList.forEach((s: any) => {
      if (s.attendance && s.attendance.length > 0) {
        totalEnrolled += s.attendance.length;
        totalPresent += s.attendance.filter((a: any) => a.isPresent).length;
      }
    });
    const avgAttendanceRate = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;

    const totalDemos = await DemoSession.countDocuments({ teacher: teacher._id });
    const completedDemos = await DemoSession.countDocuments({ teacher: teacher._id, status: 'Completed' });
    const demoConversionRate = totalDemos > 0 ? Math.round((completedDemos / totalDemos) * 100) : 0;

    const recentFeedback = await Schedule.find({
      teacher: teacher._id,
      status: 'Completed',
      notes: { $ne: '' }
    })
      .populate('batch', 'name')
      .sort({ date: -1 })
      .limit(5)
      .select('date subject notes batch');

    res.json({
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        status: teacher.status,
        subjectExpertise: teacher.subjectExpertise,
        experience: teacher.experience,
      },
      stats: {
        totalBatches,
        totalSchedules,
        completedClasses,
        cancelledClasses,
        completionRate,
        totalHoursTaught,
        avgAttendanceRate,
        totalDemos,
        completedDemos,
        demoConversionRate,
      },
      recentFeedback,
    });
  } catch (error: any) {
    console.error('Get teacher performance error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

