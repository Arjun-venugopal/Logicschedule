const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'controllers', 'scheduleController.ts');
let code = fs.readFileSync(targetPath, 'utf8');

// Normalize CRLF for matching
const isCrlf = code.includes('\r\n');
const nl = isCrlf ? '\r\n' : '\n';

// 1. Update updateSchedule
const target1 = [
  '      // Final safeguard: any schedule strictly after today must be Scheduled',
  '      if (targetDateStr > kolkata.todayStr && schedule.status === \'Completed\') {',
  '        schedule.status = \'Scheduled\';',
  '      }'
].join(nl);

const repl1 = [
  '      // Final safeguard: any schedule strictly after today must be Scheduled',
  '      if (targetDateStr > kolkata.todayStr && schedule.status === \'Completed\') {',
  '        schedule.status = \'Scheduled\';',
  '      }',
  '',
  '      // Record completedBy and completedByName when marking a class as Completed',
  '      if (schedule.status === \'Completed\') {',
  '        if (!schedule.completedBy) {',
  '          if (!isAdmin) {',
  '            const currentTeacher = await Teacher.findOne({ user: req.user._id }).populate(\'user\', \'name\');',
  '            if (currentTeacher) {',
  '              schedule.completedBy = currentTeacher._id;',
  '              schedule.completedByName = currentTeacher.name || (currentTeacher as any).user?.name || req.user.name || \'Teacher\';',
  '            } else {',
  '              schedule.completedBy = schedule.replacementTeacher || schedule.teacher;',
  '            }',
  '          } else {',
  '            schedule.completedBy = req.body.completedBy || schedule.replacementTeacher || schedule.teacher;',
  '          }',
  '        }',
  '        if (!schedule.completedByName && schedule.completedBy) {',
  '          try {',
  '            const cTeacherId = schedule.completedBy._id ? schedule.completedBy._id : schedule.completedBy;',
  '            const cTeacher = await Teacher.findById(cTeacherId).populate(\'user\', \'name\');',
  '            schedule.completedByName = cTeacher?.name || cTeacher?.user?.name || \'Teacher\';',
  '          } catch {}',
  '        }',
  '        (schedule as any).completedAt = (schedule as any).completedAt || new Date().toISOString();',
  '      }'
].join(nl);

if (!code.includes(target1)) {
  console.error('Target 1 not found in scheduleController.ts');
  process.exit(1);
}
code = code.replace(target1, repl1);

// 2. Update getSchedulesByStudent
const target2 = [
  '    let matchingSchedules: any[] = [];',
  '    if (batchIds.length > 0) {',
  '      const batchSchedules = await Schedule.find({',
  '        batch: { $in: batchIds }',
  '      })',
  '        .sort({ date: -1 })',
  '        .populate(\'teacher\', \'name email\')',
  '        .populate(\'replacementTeacher\', \'name email\')',
  '        .populate(\'batch\', \'name subject timing days meetingLink\');',
  '',
  '      matchingSchedules = batchSchedules.filter((s: any) => {',
  '        // If schedule attendance explicitly lists students, check if this student is present/listed',
  '        if (s.attendance && Array.isArray(s.attendance) && s.attendance.length > 0) {',
  '          const hasStudent = s.attendance.some((a: any) => {',
  '            const id = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();',
  '            return id === studentId;',
  '          });',
  '          if (hasStudent) return true;',
  '        }',
  '',
  '        // If schedule belongs to one of student\'s current or past batches',
  '        const schedBatchId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : \'\');',
  '        return batchIds.includes(schedBatchId);',
  '      });',
  '',
  '      // Sort by date descending',
  '      matchingSchedules.sort((a: any, b: any) => {',
  '        const tA = a.date ? new Date(a.date).getTime() : 0;',
  '        const tB = b.date ? new Date(b.date).getTime() : 0;',
  '        return tB - tA;',
  '      });',
  '    }'
].join(nl);

const repl2 = [
  '    const queryOr: any[] = [];',
  '    if (batchIds.length > 0) {',
  '      queryOr.push({ batch: { $in: batchIds } });',
  '    }',
  '    queryOr.push({ \'attendance.studentId\': studentId });',
  '',
  '    const foundSchedules = await Schedule.find({ $or: queryOr })',
  '      .sort({ date: 1 })',
  '      .populate(\'teacher\', \'name email\')',
  '      .populate(\'completedBy\', \'name email\')',
  '      .populate(\'replacementTeacher\', \'name email\')',
  '      .populate(\'batch\', \'name subject timing days meetingLink\');',
  '',
  '    const schedMap = new Map<string, any>();',
  '    for (const s of foundSchedules) {',
  '      const sId = s._id?.toString();',
  '      if (!sId || schedMap.has(sId)) continue;',
  '',
  '      // Fallback for completed classes where completedBy was not explicitly stored',
  '      if (s.status === \'Completed\') {',
  '        if (!s.completedBy) {',
  '          s.completedBy = s.replacementTeacher || s.teacher;',
  '        }',
  '        if (!s.completedByName) {',
  '          s.completedByName = s.completedBy?.name || s.replacementTeacher?.name || s.teacher?.name || \'Teacher\';',
  '        }',
  '      }',
  '      schedMap.set(sId, s);',
  '    }',
  '',
  '    // Return chronologically sorted (Class 1, Class 2, ...)',
  '    const matchingSchedules = Array.from(schedMap.values()).sort((a: any, b: any) => {',
  '      const tA = a.date ? new Date(a.date).getTime() : 0;',
  '      const tB = b.date ? new Date(b.date).getTime() : 0;',
  '      return tA - tB;',
  '    });'
].join(nl);

if (!code.includes(target2)) {
  console.error('Target 2 not found in scheduleController.ts');
  process.exit(1);
}
code = code.replace(target2, repl2);

fs.writeFileSync(targetPath, code, 'utf8');
console.log('Successfully patched scheduleController.ts');

