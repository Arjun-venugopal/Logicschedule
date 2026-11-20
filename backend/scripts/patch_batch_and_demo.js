const fs = require('fs');
const path = require('path');

// 1. UPDATE batchController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'batchController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix or add escapeRegex
  content = content.replace(
    /const escapeRegex =.*?;/g,
    ''
  );
  content = content.replace(
    "import { serverCache, deleteDiskCache } from '../utils/cache';",
    () => "import { serverCache, deleteDiskCache } from '../utils/cache';\nconst escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');"
  );

  // Update completedSlot in generateSchedulesForBatch
  const targetCompletedSlot = `        if (completedCreated < neededCompleted && isSlotPastOrNow) {
          const completedSlot = {
            teacher: teacherId || undefined,`;
  const replaceCompletedSlot = `        if (completedCreated < neededCompleted && isSlotPastOrNow) {
          const completedSlot = {
            _id: \`sched_\${_id}_\${dateKey}_\${(slotTiming.startTime || '09:00').replace(':', '')}\`,
            teacher: teacherId || undefined,`;
  if (content.includes(targetCompletedSlot)) {
    content = content.replace(targetCompletedSlot, () => replaceCompletedSlot);
  }

  // Update newSlot in generateSchedulesForBatch
  const targetNewSlot = `        } else {
          const newSlot = {
            teacher: teacherId || undefined,`;
  const replaceNewSlot = `        } else {
          const newSlot = {
            _id: \`sched_\${_id}_\${dateKey}_\${(slotTiming.startTime || '09:00').replace(':', '')}\`,
            teacher: teacherId || undefined,`;
  if (content.includes(targetNewSlot)) {
    content = content.replace(targetNewSlot, () => replaceNewSlot);
  }

  // In createBatch, add duplicate check
  const targetCreateBatch = `    if (!name || !subject) {
      res.status(400).json({ message: 'Batch name and subject are required' });
      return;
    }`;
  const replaceCreateBatch = `    if (!name || !subject) {
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
  if (content.includes(targetCreateBatch)) {
    content = content.replace(targetCreateBatch, () => replaceCreateBatch);
  }

  // In createBatch, use deterministicBatchId
  const targetBatchCreate = `    const batch = await Batch.create({
      name,
      subject,`;
  const replaceBatchCreate = `    const batch = await Batch.create({
      _id: deterministicBatchId,
      name: trimmedName,
      subject,`;
  if (content.includes(targetBatchCreate)) {
    content = content.replace(targetBatchCreate, () => replaceBatchCreate);
  }

  // In createBatch, catch duplicate error
  const targetBatchCatch = `  } catch (error: any) {
    console.error('Create batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;
  const replaceBatchCatch = `  } catch (error: any) {
    console.error('Create batch error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A batch with this name or identifier already exists.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;
  if (content.includes(targetBatchCatch)) {
    content = content.replace(targetBatchCatch, () => replaceBatchCatch);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ batchController.ts successfully patched');
}

// 2. UPDATE demoSessionController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'demoSessionController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Import formatDateToYYYYMMDD & add escapeRegex
  const targetImport = "import { checkTeacherConflict, getKolkataNow } from '../utils/scheduleHelper';";
  const replaceImport = "import { checkTeacherConflict, getKolkataNow, formatDateToYYYYMMDD } from '../utils/scheduleHelper';\nconst escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');";
  if (content.includes(targetImport)) {
    content = content.replace(targetImport, () => replaceImport);
  }

  // In createDemoSession, add duplicate checks for student and teacher
  const targetDemoCheck = `    const dateObj = new Date(date);

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

  const replaceDemoCheck = `    const dateObj = new Date(date);

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

  if (content.includes(targetDemoCheck)) {
    content = content.replace(targetDemoCheck, () => replaceDemoCheck);
  }

  // Update single student DemoSession.create call with deterministic ID
  const targetSingleDemoCreate = `    // SINGLE STUDENT BOOKING (Standard / Existing Flow)
    const demoSession = await DemoSession.create({
      teacher: teacher || null,`;

  const replaceSingleDemoCreate = `    // SINGLE STUDENT BOOKING (Standard / Existing Flow)
    const deterministicDemoId = \`demo_\${(teacher ? (typeof teacher === 'object' ? teacher._id : teacher) : 'unassigned')}_\${effectiveStudentName.toLowerCase().replace(/[^a-z0-9]/g, '')}_\${formatDateToYYYYMMDD(dateObj)}_\${startTime.replace(':', '')}\`;
    const demoSession = await DemoSession.create({
      _id: deterministicDemoId,
      teacher: teacher || null,`;

  if (content.includes(targetSingleDemoCreate)) {
    content = content.replace(targetSingleDemoCreate, () => replaceSingleDemoCreate);
  }

  // Update catch block in createDemoSession
  const targetDemoCatch = `  } catch (error: any) {
    console.error('Create demo session error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;

  const replaceDemoCatch = `  } catch (error: any) {
    console.error('Create demo session error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A demo booking already exists for this student or slot at this date and time.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;

  if (content.includes(targetDemoCatch)) {
    content = content.replace(targetDemoCatch, () => replaceDemoCatch);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ demoSessionController.ts successfully patched');
}
