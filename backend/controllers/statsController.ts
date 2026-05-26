import { Request, Response } from 'express';
import Teacher from '../models/Teacher';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';

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
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);

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
    const weekData = await Promise.all(
      DAY_LABELS.map(async (label, i) => {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
        
        let dayQuery: any = {
          date: { $gte: day, $lte: dayEnd }
        };
        if (isTeacher && teacherProfile) {
          dayQuery.teacher = teacherProfile._id;
        }

        const count = await Schedule.countDocuments(dayQuery);
        return { day: label, classes: count };
      })
    );

    // --- Live teacher status ---
    const teachers = await Teacher.find({}).select('name status subjectExpertise');
    
    let todaySchedulesQuery: any = {
      date: { $gte: todayStart, $lte: todayEnd },
      status: 'Scheduled'
    };
    const todaySchedules = await Schedule.find(todaySchedulesQuery).populate('teacher', 'name');

    // Build a set of teacher IDs that have a class today
    const activeTeacherIds = new Set(
      todaySchedules
        .map((s: any) => s.teacher?._id?.toString())
        .filter(Boolean)
    );

    const liveTeachers = teachers.map((t: any) => {
      const hasClass = activeTeacherIds.has(t._id.toString());
      const dot = hasClass ? 'bg-amber-500' :
        t.status === 'Available' ? 'bg-emerald-500' :
        t.status === 'On Leave'  ? 'bg-neutral-600' : 'bg-red-500';
      return {
        _id: t._id,
        name: t.name,
        subject: t.subjectExpertise?.[0] || '—',
        status: hasClass ? 'In Class' : t.status || 'Available',
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
