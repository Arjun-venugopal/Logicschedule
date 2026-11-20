const fs = require('fs');
const path = require('path');

// 1. UPDATE batchController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'batchController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Insert escapeRegex after imports
  if (!content.includes('const escapeRegex')) {
    const importMarker = "import { serverCache, deleteDiskCache } from '../utils/cache';";
    if (content.includes(importMarker)) {
      content = content.replace(
        importMarker,
        importMarker + "\nconst escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');"
      );
    }
  }

  // Update completedSlot and newSlot to have deterministic _id
  content = content.replace(
    'const completedSlot = {\n            teacher: teacherId || undefined,',
    "const completedSlot = {\n            _id: `sched_${_id}_${dateKey}_${(slotTiming.startTime || '09:00').replace(':', '')}`,\n            teacher: teacherId || undefined,"
  );

  content = content.replace(
    'const newSlot = {\n            teacher: teacherId || undefined,',
    "const newSlot = {\n            _id: `sched_${_id}_${dateKey}_${(slotTiming.startTime || '09:00').replace(':', '')}`,\n            teacher: teacherId || undefined,"
  );

  // In createBatch, add duplicate check
  const createBatchMarker = 'if (!name || !subject) {\n      res.status(400).json({ message: \'Batch name and subject are required\' });\n      return;\n    }';
  const createBatchReplacement = `if (!name || !subject) {
      res.status(400).json({ message: 'Batch name and subject are required' });
      return;
    }

    const trimmedName = name.trim();
    // Check if batch with this name already exists (case-insensitive)
    const existingBatch = await Batch.findOne({
      name: { $regex: \`^\\\\s*\${escapeRegex(trimmedName)}\\\\s*$\`, $options: 'i' }
    });
    if (existingBatch) {
      res.status(409).json({
        message: \`A batch with the name "\${trimmedName}" already exists. Please choose a different name.\`,
        isDuplicate: true,
      });
      return;
    }

    const deterministicBatchId = \`batch_\${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_')}\`;`;

  if (content.includes(createBatchMarker)) {
    content = content.replace(createBatchMarker, createBatchReplacement);
  }

  // Update Batch.create call in createBatch
  content = content.replace(
    'const batch = await Batch.create({\n      name,\n      subject,',
    'const batch = await Batch.create({\n      _id: deterministicBatchId,\n      name: trimmedName,\n      subject,'
  );

  // Update catch block in createBatch
  const catchMarker = "console.error('Create batch error:', error.message);\n    res.status(500).json({ message: 'Server error', detail: error.message });";
  const catchReplacement = `console.error('Create batch error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A batch with this name or identifier already exists.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });`;

  if (content.includes(catchMarker)) {
    content = content.replace(catchMarker, catchReplacement);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ batchController.ts updated cleanly');
}

// 2. UPDATE demoSessionController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'demoSessionController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Import formatDateToYYYYMMDD and add escapeRegex
  content = content.replace(
    "import { checkTeacherConflict, getKolkataNow } from '../utils/scheduleHelper';",
    "import { checkTeacherConflict, getKolkataNow, formatDateToYYYYMMDD } from '../utils/scheduleHelper';\n\nconst escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');"
  );

  // In createDemoSession, add duplicate checks for student and teacher
  const demoCheckMarker = `    const dateObj = new Date(date);

    let isConflict = false;

    // Only check conflicts if a teacher is assigned
    if (teacher) {
      const teacherId = (typeof teacher === 'object' && teacher !== null && teacher._id) ? teacher._id.toString() : teacher.toString();
      const conflictRes = await checkTeacherConflict({
        teacherId,
        date: dateObj,
        startTime,
        endTime,
      });
      isConflict = conflictRes.hasConflict;
    }`;

  const demoCheckReplacement = `    const dateObj = new Date(date);

    // Prevent duplicate demo booking for the same student on the same date and startTime
    const existingStudentDemo = await DemoSession.findOne({
      $or: [
        ...(phoneNumber ? [{ phoneNumber: phoneNumber.trim() }] : []),
        ...(studentEmail ? [{ studentEmail: studentEmail.trim().toLowerCase() }] : []),
        { studentName: { $regex: \`^\\\\s*\${escapeRegex(effectiveStudentName.trim())}\\\\s*$\`, $options: 'i' } }
      ],
      date: dateObj,
      startTime,
      status: { $ne: 'Cancelled' }
    });
    if (existingStudentDemo) {
      res.status(409).json({
        message: \`A demo session for "\${effectiveStudentName}" is already scheduled on \${formatDateToYYYYMMDD(dateObj)} at \${startTime}.\`,
        isDuplicate: true,
      });
      return;
    }

    let isConflict = false;

    // Only check conflicts and duplicate teacher bookings if a teacher is assigned
    if (teacher) {
      const teacherId = (typeof teacher === 'object' && teacher !== null && teacher._id) ? teacher._id.toString() : teacher.toString();
      
      const existingTeacherDemo = await DemoSession.findOne({
        teacher: teacherId,
        date: dateObj,
        startTime,
        status: { $ne: 'Cancelled' }
      });
      if (existingTeacherDemo) {
        res.status(409).json({
          message: \`This teacher is already booked for a demo session on \${formatDateToYYYYMMDD(dateObj)} at \${startTime}.\`,
          isDuplicate: true,
        });
        return;
      }

      const conflictRes = await checkTeacherConflict({
        teacherId,
        date: dateObj,
        startTime,
        endTime,
      });
      isConflict = conflictRes.hasConflict;
    }`;

  if (content.includes(demoCheckMarker)) {
    content = content.replace(demoCheckMarker, demoCheckReplacement);
  }

  // Update single student booking with deterministic ID
  content = content.replace(
    '// SINGLE STUDENT BOOKING (Standard / Existing Flow)\n    const demoSession = await DemoSession.create({\n      teacher: teacher || null,',
    "// SINGLE STUDENT BOOKING (Standard / Existing Flow)\n    const deterministicDemoId = `demo_${(teacher ? (typeof teacher === 'object' ? teacher._id : teacher) : 'unassigned')}_${effectiveStudentName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${formatDateToYYYYMMDD(dateObj)}_${startTime.replace(':', '')}`;\n    const demoSession = await DemoSession.create({\n      _id: deterministicDemoId,\n      teacher: teacher || null,"
  );

  // Update catch block in createDemoSession
  const demoCatchMarker = "console.error('Create demo session error:', error.message);\n    res.status(500).json({ message: 'Server error', detail: error.message });";
  const demoCatchReplacement = `console.error('Create demo session error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A demo booking already exists for this student or slot at this date and time.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });`;

  if (content.includes(demoCatchMarker)) {
    content = content.replace(demoCatchMarker, demoCatchReplacement);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ demoSessionController.ts updated cleanly');
}
