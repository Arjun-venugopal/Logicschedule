import { Response } from 'express';
import Teacher from '../models/Teacher';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import { getTeacherStatusForDate, formatDateToYYYYMMDD } from './teacherController';
import { serverCache, getSystemMemoryMetrics, clearAllDiskCache } from '../utils/cache';

// @desc    Get dashboard stats
// @route   GET /stats
// @access  Private
export const getDashboardStats = async (req: any, res: Response) => {
  try {
    const isTeacher = req.user && req.user.role === 'Teacher';
    let teacherProfile: any = null;
    if (isTeacher) {
      teacherProfile = await Teacher.findOne({ user: req.user._id });
    }

    const cacheKey = `stats_${isTeacher ? (teacherProfile?._id || req.user._id) : 'admin'}`;
    const cached = serverCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // --- Core counts (Parallelized with Promise.all across models) ---
    const teacherFilter = (isTeacher && teacherProfile) ? { assignedTeacher: teacherProfile._id } : {};
    const conflictFilter = (isTeacher && teacherProfile) ? { teacher: teacherProfile._id, conflict: true } : { conflict: true };

    const [totalTeachers, totalBatches, activeBatches, scheduleConflicts, demoConflicts] = await Promise.all([
      Teacher.countDocuments(),
      Batch.countDocuments(teacherFilter),
      Batch.countDocuments({ ...teacherFilter, status: 'Active' }),
      Schedule.countDocuments(conflictFilter),
      DemoSession.countDocuments(conflictFilter),
    ]);

    const conflicts = scheduleConflicts + demoConflicts;

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

    // --- Single-pass weekly aggregation (hours scheduled & chart buckets) ---
    let hoursScheduled = 0;
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    for (const s of weekSchedules) {
      // 1. Accumulate hours scheduled
      if (s.startTime && s.endTime) {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        let diff = (eh + em / 60) - (sh + sm / 60);
        if (diff < 0) diff += 24; // Handle shift spanning midnight
        hoursScheduled += diff;
      }

      // 2. Accumulate daily class count buckets
      if (s.date) {
        const dObj = s.date instanceof Date ? s.date : new Date(s.date);
        if (!isNaN(dObj.getTime())) {
          const dayIdx = (dObj.getUTCDay() + 6) % 7;
          if (dayIdx >= 0 && dayIdx < 7) {
            counts[dayIdx]++;
          }
        }
      }
    }

    const weekData = DAY_LABELS.map((label, i) => ({
      day: label,
      classes: counts[i],
    }));

    // --- Live teacher status with cross-indexed schedules & demo sessions ---
    const teachers = await Teacher.find({}).select('name status subjectExpertise dutyStatusSchedule');
    
    let todaySchedulesQuery: any = {
      date: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    };
    let todayDemosQuery: any = {
      date: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ['Scheduled', 'Completed'] }
    };
    if (isTeacher && teacherProfile) {
      todaySchedulesQuery.teacher = teacherProfile._id;
      todayDemosQuery.teacher = teacherProfile._id;
    }

    const [todaySchedules, todayDemos] = await Promise.all([
      Schedule.find(todaySchedulesQuery).populate('teacher', 'name').populate('batch', 'name subject'),
      DemoSession.find(todayDemosQuery).populate('teacher', 'name')
    ]);

    // Hash map grouping today's schedules and demo sessions by teacher ID for O(1) lookup
    const teacherSchedulesMap = new Map<string, any[]>();
    const addSlotsToTeacherMap = (slots: any[], isDemo = false) => {
      for (const s of slots) {
        const sTeacherId = s.teacher?._id?.toString() || s.teacher?.toString();
        if (sTeacherId) {
          let list = teacherSchedulesMap.get(sTeacherId);
          if (!list) {
            list = [];
            teacherSchedulesMap.set(sTeacherId, list);
          }
          if (isDemo && !s.batch) {
            s.batch = { name: `Demo: ${s.studentName || s.subject || 'Session'}` };
          }
          list.push(s);
        }
      }
    };

    addSlotsToTeacherMap(todaySchedules, false);
    addSlotsToTeacherMap(todayDemos, true);

    const currentDate = new Date();
    const currentTotalMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    const todayStr = formatDateToYYYYMMDD(new Date());

    const liveTeachers = teachers.map((t: any) => {
      const { status: dateStatus } = getTeacherStatusForDate(t, todayStr);
      const teacherIdStr = t._id.toString();
      const teacherTodaySchedules = teacherSchedulesMap.get(teacherIdStr) || [];

      let ongoingSched: any = null;
      let minutesLeft: number | null = null;
      let upcomingSched: any = null;
      let startsInMinutes: number | null = null;

      for (const s of teacherTodaySchedules) {
        if (s.status === 'Completed' || s.status === 'Cancelled') continue;
        if (s.startTime && s.endTime) {
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

    const todayClasses = todaySchedules.filter((s: any) => s.status === 'Scheduled').length;

    const result = {
      totalTeachers,
      totalBatches,
      activeBatches,
      todayClasses,
      conflicts,
      hoursScheduled: Math.round(hoursScheduled),
      weekData,
      liveTeachers,
    };

    serverCache.set(cacheKey, result, 30_000);
    res.json(result);
  } catch (error: any) {
    console.error('Stats error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Get runtime system memory and cache metrics
// @route   GET /stats/memory
// @access  Private/Admin
export const getMemoryMetrics = async (_req: any, res: Response) => {
  try {
    const metrics = getSystemMemoryMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('Failed to get memory metrics:', error);
    res.status(500).json({ message: 'Failed to retrieve memory metrics', detail: error.message });
  }
};

// @desc    Clear cache (L1 in-memory, L2 disk, or specific pattern)
// @route   POST /stats/cache/clear
// @access  Private/Admin
export const clearCache = async (req: any, res: Response) => {
  try {
    const { target = 'all', pattern } = req.body || {};
    let result: any = { target };

    if (target === 'l1' || target === 'all') {
      if (pattern && typeof pattern === 'string') {
        const clearedCount = serverCache.clearPattern(pattern);
        result.l1ClearedPattern = pattern;
        result.l1ClearedCount = clearedCount;
      } else {
        serverCache.clear();
        result.l1Cleared = true;
      }
    }

    if (target === 'disk' || target === 'all') {
      const diskResult = clearAllDiskCache();
      result.diskDeletedFiles = diskResult.deletedFiles;
      result.diskFreedBytes = diskResult.freedBytes;
    }

    result.currentMetrics = getSystemMemoryMetrics();
    res.json({ message: 'Cache successfully cleared', ...result });
  } catch (error: any) {
    console.error('Failed to clear cache:', error);
    res.status(500).json({ message: 'Failed to clear cache', detail: error.message });
  }
};

// @desc    Prune expired cache entries
// @route   POST /stats/cache/prune
// @access  Private/Admin
export const pruneCache = async (_req: any, res: Response) => {
  try {
    const prunedCount = serverCache.pruneExpired();
    const metrics = getSystemMemoryMetrics();
    res.json({ message: 'Expired cache entries pruned', prunedCount, currentMetrics: metrics });
  } catch (error: any) {
    console.error('Failed to prune cache:', error);
    res.status(500).json({ message: 'Failed to prune cache', detail: error.message });
  }
};

// @desc    Configure cache capacity
// @route   PUT /stats/cache/config
// @access  Private/Admin
export const updateCacheConfig = async (req: any, res: Response) => {
  try {
    const { capacity } = req.body || {};
    if (!capacity || isNaN(Number(capacity))) {
      return res.status(400).json({ message: 'Valid numerical capacity required (25 - 5000)' });
    }
    const numCap = parseInt(capacity, 10);
    serverCache.setCapacity(numCap);
    res.json({
      message: `Cache capacity updated to ${numCap}`,
      currentMetrics: getSystemMemoryMetrics(),
    });
  } catch (error: any) {
    console.error('Failed to update cache config:', error);
    res.status(500).json({ message: 'Failed to update cache configuration', detail: error.message });
  }
};
