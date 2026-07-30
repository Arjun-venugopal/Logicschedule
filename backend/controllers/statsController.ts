import { Request, Response } from 'express';
import Teacher from '../models/Teacher';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import { getTeacherStatusForDate, formatDateToYYYYMMDD } from './teacherController';

// @desc    Get dashboard stats
// @route   GET /stats
// @access  Private
export const getDashboardStats = async (req: any, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const isTeacher = req.user && req.user.role === 'Teacher';
    let teacherProfile: any = null;
    if (isTeacher) {
      teacherProfile = await Teacher.findOne({ user: req.user._id });
    }

    // --- Core counts ---
    let totalTeachers  = await Teacher.countDocuments();
    let totalBatches   = 0;
    let activeBatches  = 0;
    let conflicts      = 0;
    let todayClasses   = 0;

    if (isTeacher && teacherProfile) {
      totalBatches = await Batch.countDocuments({ assignedTeacher: teacherProfile._id });
      activeBatches = await Batch.countDocuments({ assignedTeacher: teacherProfile._id, status: 'Active' });
      conflicts = await Schedule.countDocuments({ teacher: teacherProfile._id, conflict: true });
      todayClasses = await Schedule.countDocuments({
        teacher: teacherProfile._id,
        date: { $gte: todayStart, $lte: todayEnd },
        status: 'Scheduled',
      });
    } else {
      totalBatches   = await Batch.countDocuments();
      activeBatches  = await Batch.countDocuments({ status: 'Active' });
      conflicts      = await Schedule.countDocuments({ conflict: true });
      todayClasses = await Schedule.countDocuments({
        date: { $gte: todayStart, $lte: todayEnd },
        status: 'Scheduled',
      });
    }

    // --- Hours scheduled this week ---
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() + diffToMonday); weekStart.setHours(0, 0, 0, 0);
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);

    let scheduleQuery: any = {
      date: { $gte: weekStart, $lte: weekEnd }
    };
    if (isTeacher && teacherProfile) {
      scheduleQuery.teacher = teacherProfile._id;
    }

    const weekSchedules = await Schedule.find(scheduleQuery);

    let hoursScheduled = 0;
    weekSchedules.forEach((s: any) => {
      if (s.startTime && s.endTime) {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        let diff = (eh + em / 60) - (sh + sm / 60);
        if (diff < 0) diff += 24; // Handle shift spanning midnight
        hoursScheduled += diff;
      }
    });

    // --- Weekly chart data (Mon–Sun) ---
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekData = DAY_LABELS.map((label, i) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      
      const count = weekSchedules.filter((s: any) => {
        const sDate = new Date(s.date);
        return sDate >= day && sDate <= dayEnd;
      }).length;
      
      return { day: label, classes: count };
    });

    // --- Live teacher status ---
    const teachers = await Teacher.find({}).select('name status subjectExpertise dutyStatusSchedule');
    
    let todaySchedulesQuery: any = {
      date: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    };
    const todaySchedules = await Schedule.find(todaySchedulesQuery).populate('teacher', 'name').populate('batch', 'name subject');

    const currentDate = new Date();
    const currentTotalMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    const todayStr = formatDateToYYYYMMDD(new Date());

    const liveTeachers = teachers.map((t: any) => {
      const { status: dateStatus } = getTeacherStatusForDate(t, todayStr);
      const teacherIdStr = t._id.toString();

      let ongoingSched: any = null;
      let minutesLeft: number | null = null;
      let upcomingSched: any = null;
      let startsInMinutes: number | null = null;

      for (const s of todaySchedules) {
        const sTeacherId = s.teacher?._id?.toString() || s.teacher?.toString();
        if (sTeacherId === teacherIdStr && s.startTime && s.endTime) {
          const [sh, sm] = s.startTime.split(':').map(Number);
          const [eh, em] = s.endTime.split(':').map(Number);
          const startMin = sh * 60 + sm;
          let endMin = eh * 60 + em;
          if (endMin < startMin) endMin += 1440;
          
          if (currentTotalMinutes >= startMin && currentTotalMinutes <= endMin) {
            ongoingSched = s;
            minutesLeft = endMin - currentTotalMinutes;
            break;
          } else if (startMin > currentTotalMinutes) {
            const diff = startMin - currentTotalMinutes;
            if (startsInMinutes === null || diff < startsInMinutes) {
              upcomingSched = s;
              startsInMinutes = diff;
            }
          }
        }
      }

      const isInClass = !!ongoingSched;
      const isStartingSoon = !isInClass && startsInMinutes !== null && startsInMinutes <= 60;

      const effectiveStatus = (dateStatus === 'On Leave' || dateStatus === 'Off Duty')
        ? dateStatus
        : isInClass ? 'In Class'
        : isStartingSoon ? 'Class Starting Soon'
        : dateStatus;

      const dot = effectiveStatus === 'In Class' ? 'bg-amber-500' :
        effectiveStatus === 'Class Starting Soon' ? 'bg-amber-400' :
        effectiveStatus === 'Available' ? 'bg-emerald-500' :
        (effectiveStatus === 'On Leave' || effectiveStatus === 'Off Duty') ? 'bg-neutral-600' : 'bg-blue-500';

      return {
        _id: t._id,
        name: t.name,
        subject: ongoingSched?.batch?.name || ongoingSched?.subject || upcomingSched?.batch?.name || t.subjectExpertise?.[0] || '—',
        status: effectiveStatus,
        minutesLeft,
        startsInMinutes,
        dot,
      };
    });

    res.json({
      totalTeachers,
      totalBatches,
      activeBatches,
      todayClasses,
      conflicts,
      hoursScheduled: Math.round(hoursScheduled),
      weekData,
      liveTeachers,
    });
  } catch (error: any) {
    console.error('Stats error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
