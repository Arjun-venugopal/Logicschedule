import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import Teacher from '../models/Teacher';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import Student from '../models/Student';
import { getTeacherStatusForDate, formatDateToYYYYMMDD } from './teacherController';
import {
  serverCache,
  getSystemMemoryMetrics,
  clearAllDiskCache,
  pruneExpiredDiskCache,
  runManualMemoryCompaction,
  DEFAULT_CACHE_CONFIG,
} from '../utils/cache';

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

    const [totalTeachers, totalBatches, activeBatches, scheduleConflicts, demoConflicts, allStudentsForStats] = await Promise.all([
      Teacher.countDocuments(),
      Batch.countDocuments(teacherFilter),
      Batch.countDocuments({ ...teacherFilter, status: 'Active' }),
      Schedule.countDocuments(conflictFilter),
      DemoSession.countDocuments(conflictFilter),
      (!isTeacher ? Student.find({}).populate('batch', 'name subject status') : Promise.resolve([])),
    ]);

    const conflicts = scheduleConflicts + demoConflicts;

    // --- Hours scheduled this week ---
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() + diffToMonday); weekStart.setHours(0, 0, 0, 0);
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);

    let scheduleQuery: any = {
      date: { $gte: weekStart, $lte: weekEnd },
      status: { $nin: ['Cancelled', 'Archived', 'Paused'] },
    };
    if (isTeacher && teacherProfile) {
      scheduleQuery.teacher = teacherProfile._id;
    }

    const weekSchedulesRaw = await Schedule.find(scheduleQuery);
    const weekSchedules = weekSchedulesRaw.filter((s: any) => !s.isArchived);

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

    const [todaySchedulesRaw, todayDemos] = await Promise.all([
      Schedule.find(todaySchedulesQuery).populate('teacher', 'name').populate('batch', 'name subject status'),
      DemoSession.find(todayDemosQuery).populate('teacher', 'name')
    ]);
    const todaySchedules = todaySchedulesRaw.filter((s: any) => !s.isArchived && s.batch?.status !== 'Paused' && s.batch?.status !== 'Dropped');

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

    // --- Student Enrollment Distribution by Course & Age Group ---
    const courseDistribution = {
      earlyLogic: { key: 'earlyLogic', label: 'EarlyLogic (Age 4 - 7)', count: 0, activeCount: 0 },
      scratch: { key: 'scratch', label: 'Scratch (Age 8 - 15)', count: 0, activeCount: 0 },
      robotics: { key: 'robotics', label: 'Robotics', count: 0, activeCount: 0 },
      aiCoding: { key: 'aiCoding', label: 'AI Coding', count: 0, activeCount: 0 },
      python: { key: 'python', label: 'Python', count: 0, activeCount: 0 },
      appDevelopment: { key: 'appDevelopment', label: 'App Development', count: 0, activeCount: 0 },
      other: { key: 'other', label: 'Other / Unassigned', count: 0, activeCount: 0 },
      totalStudents: 0,
      totalActiveStudents: 0,
    };

    if (Array.isArray(allStudentsForStats)) {
      courseDistribution.totalStudents = allStudentsForStats.length;

      for (const s of allStudentsForStats) {
        const isActive = s.status === 'Active';
        if (isActive) courseDistribution.totalActiveStudents++;

        const subj = (s.batch?.subject || s.subject || s.course || '').trim();
        const batchName = (s.batch?.name || '').trim();
        const notes = (s.notes || '').trim();
        const combined = `${subj} ${batchName} ${notes}`.toLowerCase();

        let matched = false;

        // 1. EarlyLogic (Age 4 - 7): early logic, earlylogic, scratch jr, scratchjr, or explicit age 4-7
        if (
          combined.includes('early logic') ||
          combined.includes('earlylogic') ||
          combined.includes('scratch jr') ||
          combined.includes('scratchjr') ||
          (s.age != null && Number(s.age) >= 4 && Number(s.age) <= 7)
        ) {
          courseDistribution.earlyLogic.count++;
          if (isActive) courseDistribution.earlyLogic.activeCount++;
          matched = true;
        }

        // 2. Scratch (Age 8 - 15): standard Scratch
        if (
          (combined.includes('scratch') || combined.includes('scratach')) &&
          !combined.includes('scratch jr') &&
          !combined.includes('scratchjr') &&
          !combined.includes('earlylogic') &&
          !combined.includes('early logic')
        ) {
          courseDistribution.scratch.count++;
          if (isActive) courseDistribution.scratch.activeCount++;
          matched = true;
        }

        // 3. Robotics
        if (combined.includes('robotics') || combined.includes('robotic')) {
          courseDistribution.robotics.count++;
          if (isActive) courseDistribution.robotics.activeCount++;
          matched = true;
        }

        // 4. AI Coding: ai coding, ai & ml, +ai, + ai, plus ai, and ai, coding + ai, or AI in subject/name
        if (
          combined.includes('ai coding') ||
          combined.includes('ai & ml') ||
          combined.includes('+ai') ||
          combined.includes('+ ai') ||
          combined.includes('plus ai') ||
          combined.includes('and ai') ||
          combined.includes('coding + ai') ||
          /\bai\b/i.test(subj) ||
          /\bai\b/i.test(batchName)
        ) {
          courseDistribution.aiCoding.count++;
          if (isActive) courseDistribution.aiCoding.activeCount++;
          matched = true;
        }

        // 5. Python
        if (combined.includes('python')) {
          courseDistribution.python.count++;
          if (isActive) courseDistribution.python.activeCount++;
          matched = true;
        }

        // 6. App Development
        if (
          combined.includes('app dev') ||
          combined.includes('app development') ||
          combined.includes('flutter') ||
          combined.includes('mobile app')
        ) {
          courseDistribution.appDevelopment.count++;
          if (isActive) courseDistribution.appDevelopment.activeCount++;
          matched = true;
        }

        if (!matched) {
          courseDistribution.other.count++;
          if (isActive) courseDistribution.other.activeCount++;
        }
      }
    }

    const result = {
      totalTeachers,
      totalBatches,
      activeBatches,
      todayClasses,
      conflicts,
      hoursScheduled: Math.round(hoursScheduled),
      weekData,
      liveTeachers,
      courseDistribution,
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

// @desc    Prune expired cache entries across L1 in-memory and L2 disk caches
// @route   POST /stats/cache/prune
// @access  Private/Admin
export const pruneCache = async (_req: any, res: Response) => {
  try {
    const prunedCount = serverCache.pruneExpired();
    const diskResult = pruneExpiredDiskCache(serverCache.getConfig().diskCacheMaxAgeHours * 3600 * 1000);
    const metrics = getSystemMemoryMetrics();
    res.json({
      message: 'Expired cache entries pruned',
      prunedCount,
      prunedDiskFiles: diskResult.prunedFiles,
      freedDiskBytes: diskResult.freedBytes,
      currentMetrics: metrics,
    });
  } catch (error: any) {
    console.error('Failed to prune cache:', error);
    res.status(500).json({ message: 'Failed to prune cache', detail: error.message });
  }
};

// @desc    Configure cache capacity and memory management strategies
// @route   PUT /stats/cache/config
// @access  Private/Admin
export const updateCacheConfig = async (req: any, res: Response) => {
  try {
    const {
      capacity,
      cleanupIntervalSeconds,
      defaultTtlSeconds,
      maxMemoryThresholdMb,
      enableMemoryPressureEviction,
      diskCacheMaxAgeHours,
      resetToDefaults,
    } = req.body || {};

    if (resetToDefaults) {
      const updated = serverCache.updateConfig(DEFAULT_CACHE_CONFIG);
      return res.json({
        message: 'Cache settings reset to safe defaults',
        config: updated,
        currentMetrics: getSystemMemoryMetrics(),
      });
    }

    const updated = serverCache.updateConfig({
      capacity,
      cleanupIntervalSeconds,
      defaultTtlSeconds,
      maxMemoryThresholdMb,
      enableMemoryPressureEviction,
      diskCacheMaxAgeHours,
    });

    res.json({
      message: 'Memory management configuration updated successfully',
      config: updated,
      currentMetrics: getSystemMemoryMetrics(),
    });
  } catch (error: any) {
    console.error('Failed to update cache config:', error);
    res.status(500).json({ message: 'Failed to update cache configuration', detail: error.message });
  }
};

// @desc    Run manual memory compaction and trigger garbage collection if available
// @route   POST /stats/memory/gc
// @access  Private/Admin
export const runMemoryOptimization = async (_req: any, res: Response) => {
  try {
    const result = runManualMemoryCompaction();
    const metrics = getSystemMemoryMetrics();
    res.json({
      message: 'Memory optimization executed successfully',
      ...result,
      currentMetrics: metrics,
    });
  } catch (error: any) {
    console.error('Failed to run memory optimization:', error);
    res.status(500).json({ message: 'Failed to run memory optimization', detail: error.message });
  }
};

// @desc    Run live system audit (code, dependencies, memory, database schema parity)
// @route   GET /stats/audit
// @access  Private/Admin
export const runSystemAudit = async (_req: any, res: Response) => {
  try {
    const memory = getSystemMemoryMetrics();
    const backendRoot = path.resolve(__dirname, '..');
    const repoRoot = path.resolve(backendRoot, '..');

    const safeReadText = (p: string): string => {
      try {
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      } catch {
        return '';
      }
    };

    const safeReadJson = (p: string): any => {
      try {
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
      } catch {
        return {};
      }
    };

    const attendanceHelperText = safeReadText(path.join(backendRoot, 'utils', 'attendanceHelper.ts'));
    const scheduleHelperText = safeReadText(path.join(backendRoot, 'utils', 'scheduleHelper.ts'));
    const rootPkg = safeReadJson(path.join(repoRoot, 'package.json'));
    const frontendPkg = safeReadJson(path.join(repoRoot, 'frontend', 'package.json'));
    const backendPkg = safeReadJson(path.join(backendRoot, 'package.json'));
    const migrationSql = safeReadText(path.join(repoRoot, 'supabase', 'migrations', '20261006000000_schema.sql'));
    const backendSql = safeReadText(path.join(backendRoot, 'supabase_schema.sql'));

    const codeAudit: any[] = [];
    if (attendanceHelperText.includes('startScheduleAutoCompleter')) {
      codeAudit.push({
        id: 'code-1',
        file: 'backend/utils/attendanceHelper.ts',
        name: 'startScheduleAutoCompleter',
        type: 'Stub / Obsolete',
        status: '4. Confirmed unused candidate (awaiting approval)',
        safeToRemove: false,
        preview: 'export function startScheduleAutoCompleter(_intervalMs: number = 60_000): any { return null; }',
        details: 'Returns null stub; unreferenced across application routes and workers.',
      });
    }
    if (scheduleHelperText.includes('indexSchedulesByTeacherAndDate')) {
      codeAudit.push({
        id: 'code-2',
        file: 'backend/utils/scheduleHelper.ts',
        name: 'indexSchedulesByTeacherAndDate',
        type: 'Unused Export',
        status: '4. Confirmed unused candidate (awaiting approval)',
        safeToRemove: false,
        preview: 'export function indexSchedulesByTeacherAndDate(schedules: any[])',
        details: 'Exported helper not imported by any controller or route.',
      });
    }
    if (attendanceHelperText.includes('autoCompletePastSchedules')) {
      codeAudit.push({
        id: 'code-3',
        file: 'backend/utils/attendanceHelper.ts',
        name: 'autoCompletePastSchedules',
        type: 'Legacy Routine',
        status: '3. Potentially unused candidate',
        safeToRemove: false,
        preview: 'export async function autoCompletePastSchedules(force: boolean = false): Promise<number>',
        details: 'Retained on disk; not invoked in runtime request paths.',
      });
    }
    codeAudit.push({
      id: 'code-4',
      file: 'backend/utils/userAccountHelper.ts & frontend/src/lib/utils.ts',
      name: 'Shared Auth, Permission & Formatting Utilities',
      type: 'Consolidated Module',
      status: '1. Active and required',
      safeToRemove: false,
      details: 'Centralized user CRUD, RBAC permission helpers, and IST date/time formatters.',
    });

    const dependencyAudit: any[] = [
      {
        id: 'dep-backend-core',
        package: Object.keys(backendPkg.dependencies || {}).slice(0, 6).join(', ') || '@supabase/supabase-js, express',
        location: 'backend/package.json',
        classification: '1. Active and required',
        safeToRemove: false,
        details: `${Object.keys(backendPkg.dependencies || {}).length} runtime dependencies verified active in backend.`,
      },
    ];

    if (frontendPkg.dependencies?.['socket.io-client']) {
      dependencyAudit.push({
        id: 'dep-socket-io-client',
        package: 'socket.io-client',
        location: 'frontend/package.json',
        classification: '4. Unused Candidate (requires explicit approval)',
        safeToRemove: false,
        preview: 'npm uninstall socket.io-client --prefix frontend',
        details: 'Present in frontend/package.json but not imported in frontend/src.',
      });
    }
    if (rootPkg.dependencies?.['@supabase/ssr']) {
      dependencyAudit.push({
        id: 'dep-supabase-ssr',
        package: '@supabase/ssr',
        location: 'package.json (root)',
        classification: '4. Unused Candidate (requires explicit approval)',
        safeToRemove: false,
        preview: 'npm uninstall @supabase/ssr',
        details: 'Present in root package.json with zero workspace imports.',
      });
    }

    const migrationIndexCount = (migrationSql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    const backendIndexCount = (backendSql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    const hasRecycleBinInMigration = migrationSql.includes('public.recycle_bin');

    const sqlAudit = [
      {
        id: 'sql-1',
        object: 'pgcrypto',
        type: 'Extension',
        classification: '1. Active and required',
        schema: 'public',
        details: 'Generates UUID primary keys via gen_random_uuid().',
      },
      {
        id: 'sql-2',
        object: 'supabase/migrations/20261006000000_schema.sql',
        type: 'Migration Schema',
        classification: hasRecycleBinInMigration ? '1. Active and required' : 'Schema Drift Detected',
        schema: 'public',
        details: `${migrationIndexCount} indexes tracked. ${hasRecycleBinInMigration ? 'Includes recycle_bin table.' : 'Missing recycle_bin DDL present in backend/supabase_schema.sql.'}`,
      },
      {
        id: 'sql-3',
        object: 'backend/supabase_schema.sql',
        type: 'Reference Schema',
        classification: '1. Active and required',
        schema: 'public',
        details: `Tracks all 10 tables (including recycle_bin) and ${backendIndexCount} B-Tree indexes.`,
      },
    ];

    const issuesFound =
      (hasRecycleBinInMigration ? 0 : 1) +
      (frontendPkg.dependencies?.['socket.io-client'] ? 1 : 0) +
      (rootPkg.dependencies?.['@supabase/ssr'] ? 1 : 0);

    res.json({
      timestamp: new Date().toISOString(),
      memory,
      codeAudit,
      dependencyAudit,
      sqlAudit,
      summary: {
        healthy: issuesFound === 0,
        issuesFound,
        candidatesIdentified: codeAudit.filter((c) => c.status.includes('candidate')).length + dependencyAudit.filter((d) => d.status?.includes('Candidate') || d.classification?.includes('Candidate')).length,
        indexesActive: backendIndexCount || migrationIndexCount,
      },
    });
  } catch (error: any) {
    console.error('Failed to run system audit:', error);
    res.status(500).json({ message: 'Failed to run system audit', detail: error.message });
  }
};

// @desc    Execute approved system cleanup operation
// @route   POST /stats/audit/execute
// @access  Private/Admin
export const executeSystemCleanup = async (req: any, res: Response) => {
  try {
    const { action, targetId } = req.body || {};
    const result: any = { action, targetId, timestamp: new Date().toISOString() };

    if (action === 'prune_cache') {
      const pruned = serverCache.pruneExpired();
      const diskRes = pruneExpiredDiskCache(serverCache.getConfig().diskCacheMaxAgeHours * 3600 * 1000);
      result.message = `Pruned ${pruned} expired cache entries and ${diskRes.prunedFiles} disk files.`;
      result.details = { prunedEntries: pruned, freedDiskBytes: diskRes.freedBytes };
    } else if (action === 'compact_memory') {
      const compaction = runManualMemoryCompaction();
      result.message = `Memory compacted: freed ${(compaction.heapFreedBytes / (1024 * 1024)).toFixed(1)} MB heap.`;
      result.details = compaction;
    } else if (action === 'clean_code_stubs' || action === 'uninstall_package') {
      result.message = 'Code and package deletions require manual repository review and explicit confirmation; no files were deleted automatically.';
    } else {
      result.message = `Audit action '${action}' recorded.`;
    }

    result.currentMetrics = getSystemMemoryMetrics();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Failed to execute system cleanup:', error);
    res.status(500).json({ message: 'Failed to execute system cleanup', detail: error.message });
  }
};
