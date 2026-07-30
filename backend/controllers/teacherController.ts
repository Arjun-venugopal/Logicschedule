import { Request, Response } from 'express';
import Teacher from '../models/Teacher';
import User from '../models/User';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import Student from '../models/Student';

export function formatDateToYYYYMMDD(dateVal: Date | string): string {
  if (!dateVal) return new Date().toLocaleDateString('en-CA');
  if (typeof dateVal === 'string') {
    if (dateVal.includes('T')) {
      const parsed = new Date(dateVal);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return dateVal.split('T')[0];
    }
    return dateVal;
  }
  const y = dateVal.getFullYear();
  const m = String(dateVal.getMonth() + 1).padStart(2, '0');
  const d = String(dateVal.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTeacherStatusForDate(teacher: any, dateVal: Date | string): { status: string; reason?: string } {
  const dateStr = formatDateToYYYYMMDD(dateVal);
  if (teacher?.dutyStatusSchedule && Array.isArray(teacher.dutyStatusSchedule)) {
    const activeEntry = teacher.dutyStatusSchedule.find((item: any) => {
      const start = formatDateToYYYYMMDD(item.startDate);
      const end = formatDateToYYYYMMDD(item.endDate || item.startDate);
      return dateStr >= start && dateStr <= end;
    });
    if (activeEntry) {
      return { status: activeEntry.status, reason: activeEntry.reason };
    }
  }
  return { status: teacher.status || 'Available' };
}

// @desc    Get all teachers
// @route   GET /teachers
// @access  Private
export const getTeachers = async (req: Request, res: Response) => {
  try {
    const teachers = await Teacher.find({}).populate('user', 'name email role mustChangePassword').lean();
    
    // Calculate current dynamic availability
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);
    const todayStr = formatDateToYYYYMMDD(new Date());
    
    // Use actual current hour and minute for comparison
    const currentDate = new Date();
    const currentTotalMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

    const todaySchedules = await Schedule.find({
      date: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ['Scheduled', 'Completed'] } // Include both to be safe if a class is running
    });

    const todayDemos = await DemoSession.find({
      date: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    });

    const result = teachers.map((teacher: any) => {
      const { status: dateStatus, reason: statusReason } = getTeacherStatusForDate(teacher, todayStr);

      // If teacher has date-based or manual 'On Leave' or 'Off Duty', respect it.
      if (dateStatus === 'On Leave' || dateStatus === 'Off Duty' || dateStatus === 'Half Day') {
        return {
          ...teacher,
          status: dateStatus,
          dutyStatusReason: statusReason,
          dutyStatusSchedule: teacher.dutyStatusSchedule || []
        };
      }

      let isBusy = false;
      
      // Check classes
      for (const sched of todaySchedules) {
        if (sched.teacher && sched.teacher.toString() === teacher._id.toString()) {
          const [sh, sm] = sched.startTime.split(':').map(Number);
          const [eh, em] = sched.endTime.split(':').map(Number);
          const startMin = sh * 60 + sm;
          const endMin = eh * 60 + em;
          if (currentTotalMinutes >= startMin && currentTotalMinutes <= endMin) {
            isBusy = true;
            break;
          }
        }
      }

      // Check demos
      if (!isBusy) {
        for (const demo of todayDemos) {
          if (demo.teacher && demo.teacher.toString() === teacher._id.toString()) {
            const [sh, sm] = demo.startTime.split(':').map(Number);
            const [eh, em] = demo.endTime.split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;
            if (currentTotalMinutes >= startMin && currentTotalMinutes <= endMin) {
              isBusy = true;
              break;
            }
          }
        }
      }

      return {
        ...teacher,
        status: isBusy ? 'In Class' : dateStatus,
        dutyStatusReason: statusReason,
        dutyStatusSchedule: teacher.dutyStatusSchedule || []
      };
    });

    res.json(result);
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
    const { name, email, phone, subjectExpertise, experience, status, tempPassword, address, hourlyRate } = req.body;

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
      address: address || '',
      employmentType: req.body.employmentType || 'Full Time',
      hourlyRate: req.body.employmentType === 'Part Time' && hourlyRate ? Number(hourlyRate) : 0,
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
    const teacher = await Teacher.findById(req.params.id as string);

    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' });
      return;
    }

    teacher.name              = req.body.name ?? teacher.name;
    teacher.phone             = req.body.phone ?? teacher.phone;
    teacher.address           = req.body.address ?? teacher.address;
    if (req.body.employmentType !== undefined) {
      teacher.employmentType = req.body.employmentType;
      if (req.body.employmentType === 'Full Time') {
        teacher.hourlyRate = 0;
      } else if (req.body.hourlyRate !== undefined) {
        teacher.hourlyRate = Number(req.body.hourlyRate);
      }
    } else if (req.body.hourlyRate !== undefined) {
      teacher.hourlyRate = Number(req.body.hourlyRate);
    }
    teacher.subjectExpertise  = req.body.subjectExpertise ?? teacher.subjectExpertise;
    teacher.experience        = req.body.experience ?? teacher.experience;
    teacher.status            = req.body.status ?? teacher.status;
    teacher.availability      = req.body.availability ?? teacher.availability;
    teacher.dutyStatusSchedule = req.body.dutyStatusSchedule ?? teacher.dutyStatusSchedule;
    teacher.workloadPercentage = req.body.workloadPercentage ?? teacher.workloadPercentage;

    if (req.body.tempPassword || req.body.password) {
      const newPwd = req.body.tempPassword || req.body.password;
      teacher.tempPassword = newPwd;
      if (teacher.user) {
        const userId = typeof teacher.user === 'object' ? teacher.user._id || teacher.user.id : teacher.user;
        if (userId) {
          await User.update(userId, { password: newPwd });
        }
      }
    }

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
    const teacher = await Teacher.findById(req.params.id as string);

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
    if (req.body.dutyStatusSchedule !== undefined) teacher.dutyStatusSchedule = req.body.dutyStatusSchedule;

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
    const { timeRange, demoStatus, batchStatus, studentId } = req.query;

    let teacher: any = null;

    if (id === 'me' || id === 'self') {
      teacher = await Teacher.findOne({ user: req.user._id });
    } else {
      if (id.length < 5) {
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
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin' && req.user.role !== 'Sub Admin') {
      const teacherUserId = (teacher.user?._id || teacher.user)?.toString();
      if (teacherUserId !== req.user._id.toString()) {
        res.status(403).json({ message: 'Forbidden: You can only view your own performance' });
        return;
      }
    }

    // Date Filtering Logic
    let dateFilter: any = {};
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      if (timeRange === 'day') {
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now); end.setHours(23,59,59,999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeRange === 'week') {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const start = new Date(now); start.setDate(now.getDate() + diffToMonday); start.setHours(0,0,0,0);
        const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeRange === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeRange === 'year') {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      }
    }

    // Batch & Student Filtering Logic
    let batchQuery: any = { assignedTeacher: teacher._id };
    if (batchStatus && batchStatus !== 'all') {
      batchQuery.status = batchStatus;
    }

    if (studentId && studentId !== 'all') {
      const student = await Student.findById(studentId);
      let studentBatches: any[] = [];
      if (student) {
        if (student.batch) studentBatches.push(student.batch);
        if (student.pastBatches) {
          student.pastBatches.forEach((pb: any) => {
            if (pb.batch) studentBatches.push(pb.batch);
          });
        }
      }
      batchQuery._id = { $in: studentBatches };
    }

    const matchedBatches = await Batch.find(batchQuery);
    const matchedBatchIds = matchedBatches.map((b: any) => b._id);
    const totalBatches = matchedBatchIds.length;

    // Fetch schedules based on date and batch filters
    const scheduleQuery: any = { teacher: teacher._id };
    if (dateFilter.$gte) {
      scheduleQuery.date = dateFilter;
    }
    // If we are filtering by batchStatus or studentId, limit schedules to those batches
    if ((batchStatus && batchStatus !== 'all') || (studentId && studentId !== 'all')) {
      scheduleQuery.batch = { $in: matchedBatchIds };
    }

    const allSchedulesList = await Schedule.find(scheduleQuery).populate('batch', 'name subject').sort({ date: -1 });
    
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
        if (studentId && studentId !== 'all') {
          // If filtering by student, only consider this student's attendance
          const studentAttendance = s.attendance.find((a: any) => a.studentId.toString() === studentId.toString());
          if (studentAttendance) {
            totalEnrolled += 1;
            if (studentAttendance.isPresent) totalPresent += 1;
          }
        } else {
          totalEnrolled += s.attendance.length;
          totalPresent += s.attendance.filter((a: any) => a.isPresent).length;
        }
      }
    });
    const avgAttendanceRate = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;

    // Fetch Demo Sessions
    const demoQuery: any = { teacher: teacher._id };
    if (dateFilter.$gte) {
      demoQuery.date = dateFilter;
    }
    
    if (demoStatus && demoStatus !== 'all') {
      demoQuery.status = demoStatus;
    }

    if (studentId && studentId !== 'all') {
      const student = await Student.findById(studentId);
      if (student) {
        // Find demos matching the student's email or phone or name (approximate match)
        demoQuery.$or = [
          { studentName: { $regex: new RegExp(`^${student.name}$`, 'i') } },
          { studentEmail: student.email }
        ];
      }
    }
    
    const totalDemos = await DemoSession.countDocuments(demoQuery);
    const completedDemos = await DemoSession.countDocuments({ ...demoQuery, status: 'Completed' });
    const demoConversionRate = totalDemos > 0 ? Math.round((completedDemos / totalDemos) * 100) : 0;

    const demoSessions = await DemoSession.find(demoQuery).sort({ date: -1 }).limit(20);

    // Fetch students assigned to this teacher (current or past)
    const allTeacherBatches = await Batch.find({ assignedTeacher: teacher._id }).select('_id');
    const allTeacherBatchIds = allTeacherBatches.map((b: any) => b._id);
    const assignedStudents = await Student.find({
      $or: [
        { batch: { $in: allTeacherBatchIds } },
        { 'pastBatches.batch': { $in: allTeacherBatchIds } }
      ]
    }).select('_id name');

    const recentFeedback = completedSchedulesList
      .filter((s: any) => s.notes && s.notes !== 'Auto-generated for batch')
      .slice(0, 10);

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
      demoSessions,
      assignedStudents,
      recentFeedback,
      filteredBatches: matchedBatches,
      filteredSchedules: allSchedulesList,
    });
  } catch (error: any) {
    console.error('Get teacher performance error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Get detailed real-time teacher timings & availability
// @route   GET /teachers/timings
// @access  Private
export const getTeacherTimings = async (req: Request, res: Response): Promise<void> => {
  try {
    let dayStart: Date;
    let dayEnd: Date;

    if (req.query.startDate && req.query.endDate) {
      dayStart = new Date(req.query.startDate as string);
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(req.query.endDate as string);
      dayEnd.setHours(23, 59, 59, 999);
    } else {
      const targetDateStr = (req.query.date as string) || new Date().toISOString();
      const targetDate = new Date(targetDateStr);
      dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);
    }

    const now = new Date();
    const isToday = now >= dayStart && now <= dayEnd;
    const currentTotalMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

    const teachers = await Teacher.find({}).populate('user', 'name email role').lean();

    const schedules = await Schedule.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    }).populate('batch', 'name subject').populate('teacher', 'name email').populate('replacementTeacher', 'name email').lean();

    const demos = await DemoSession.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    }).populate('teacher', 'name email').lean();

    let freeCount = 0;
    let inClassCount = 0;
    let startingSoonCount = 0;
    let onLeaveCount = 0;

    const resultTeachers = teachers.map((teacher: any) => {
      const teacherIdStr = teacher._id.toString();

      // Gather today's schedules & demos for this teacher
      const teacherSchedules = schedules.filter((s: any) => 
        (s.teacher && (s.teacher._id || s.teacher).toString() === teacherIdStr) ||
        (s.replacementTeacher && (s.replacementTeacher._id || s.replacementTeacher).toString() === teacherIdStr)
      );

      const teacherDemos = demos.filter((d: any) => 
        d.teacher && (d.teacher._id || d.teacher).toString() === teacherIdStr
      );

      // Map to standardized item format
      const items: any[] = [];

      teacherSchedules.forEach((s: any) => {
        if (!s.startTime || !s.endTime) return;
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin < startMin) endMin += 1440;

        items.push({
          id: s._id,
          type: 'Class',
          date: s.date,
          batchName: s.batch?.name || s.subject || 'Regular Class',
          subject: s.batch?.subject || s.subject || teacher.subjectExpertise?.[0] || 'General',
          startTime: s.startTime,
          endTime: s.endTime,
          startMin,
          endMin,
          status: s.status,
          meetingLink: s.meetingLink || '',
          isReplacement: s.replacementTeacher && (s.replacementTeacher._id || s.replacementTeacher).toString() === teacherIdStr
        });
      });

      teacherDemos.forEach((d: any) => {
        if (!d.startTime || !d.endTime) return;
        const [sh, sm] = d.startTime.split(':').map(Number);
        const [eh, em] = d.endTime.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin < startMin) endMin += 1440;

        items.push({
          id: d._id,
          type: 'Demo',
          date: d.date,
          batchName: `Demo: ${d.studentName || 'Student'}`,
          subject: d.subject || teacher.subjectExpertise?.[0] || 'Demo',
          startTime: d.startTime,
          endTime: d.endTime,
          startMin,
          endMin,
          status: d.status,
          meetingLink: d.meetingLink || '',
          isReplacement: false
        });
      });

      // Sort items by startMin
      items.sort((a, b) => a.startMin - b.startMin);


      let currentClass: any = null;
      let nextClass: any = null;
      let lastCompletedClass: any = null;
      let minutesLeftInCurrentClass: number | null = null;
      let minutesToNextClass: number | null = null;
      let currentClassProgress = 0;

      const finishedItems = items.filter(i => isToday ? (i.endMin < currentTotalMinutes || i.status === 'Completed') : i.status === 'Completed');
      if (finishedItems.length > 0) {
        const lastFinished = finishedItems[finishedItems.length - 1];
        lastCompletedClass = {
          title: lastFinished.batchName,
          subject: lastFinished.subject,
          type: lastFinished.type,
          startTime: lastFinished.startTime,
          endTime: lastFinished.endTime,
          status: 'Class Finished'
        };
      }

      if (isToday && currentTotalMinutes >= 0) {
        // Find current class
        const ongoing = items.find(i => currentTotalMinutes >= i.startMin && currentTotalMinutes <= i.endMin);
        if (ongoing) {
          currentClass = ongoing;
          minutesLeftInCurrentClass = ongoing.endMin - currentTotalMinutes;
          const duration = ongoing.endMin - ongoing.startMin;
          currentClassProgress = duration > 0 ? Math.min(100, Math.max(0, Math.round(((currentTotalMinutes - ongoing.startMin) / duration) * 100))) : 100;
        }

        // Find next class
        const upcoming = items.find(i => i.startMin > currentTotalMinutes);
        if (upcoming) {
          nextClass = upcoming;
          minutesToNextClass = upcoming.startMin - currentTotalMinutes;
        }
      }

      // Determine live status
      const dateStr = (req.query.date as string)
        ? (req.query.date as string).split('T')[0]
        : dayStart.toISOString().split('T')[0];

      const { status: activeDateStatus, reason: activeStatusReason } = getTeacherStatusForDate(teacher, dateStr);

      let liveStatus: 'On Leave' | 'Off Duty' | 'In Class' | 'Class Starting Soon' | 'Free' = 'Free';

      if (activeDateStatus === 'On Leave' || activeDateStatus === 'Off Duty') {
        liveStatus = activeDateStatus as any;
        onLeaveCount++;
      } else if (currentClass) {
        liveStatus = 'In Class';
        inClassCount++;
      } else if (nextClass && minutesToNextClass !== null && minutesToNextClass <= 60 && minutesToNextClass >= 0) {
        liveStatus = 'Class Starting Soon';
        startingSoonCount++;
      } else {
        liveStatus = 'Free';
        freeCount++;
      }

      const todayClassesCount = items.length;
      const completedClassesCount = finishedItems.length;

      return {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        subjectExpertise: teacher.subjectExpertise || [],
        experience: teacher.experience || 0,
        employmentType: teacher.employmentType || 'Full Time',
        status: activeDateStatus, // Effective status for target date
        rawStatus: teacher.status || 'Available',
        dutyStatusSchedule: teacher.dutyStatusSchedule || [],
        dutyStatusReason: activeStatusReason || '',
        availability: teacher.availability || [],
        liveStatus,
        currentClass: currentClass ? {
          title: currentClass.batchName,
          subject: currentClass.subject,
          type: currentClass.type,
          startTime: currentClass.startTime,
          endTime: currentClass.endTime,
          minutesLeft: minutesLeftInCurrentClass,
          progress: currentClassProgress,
          meetingLink: currentClass.meetingLink
        } : null,
        lastCompletedClass,
        nextClass: nextClass ? {
          title: nextClass.batchName,
          subject: nextClass.subject,
          type: nextClass.type,
          startTime: nextClass.startTime,
          endTime: nextClass.endTime,
          startsInMinutes: minutesToNextClass,
          meetingLink: nextClass.meetingLink
        } : null,
        todayClassesCount,
        completedClassesCount,
        todayScheduleItems: items
      };
    });

    res.json({
      summary: {
        totalTeachers: teachers.length,
        freeCount,
        inClassCount,
        startingSoonCount,
        onLeaveCount
      },
      currentTotalMinutes,
      isToday,
      teachers: resultTeachers
    });
  } catch (error: any) {
    console.error('Get teacher timings error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

