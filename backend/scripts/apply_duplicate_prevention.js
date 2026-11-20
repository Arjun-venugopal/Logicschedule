const fs = require('fs');
const path = require('path');

// 1. UPDATE batchController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'batchController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add deterministicBatchId and duplicate check in createBatch
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
    content = content.replace(targetCreateBatch, replaceCreateBatch);
  }

  // Update Batch.create call to include _id and trimmed name
  const targetBatchCreateCall = `    const batch = await Batch.create({
      name,
      subject,`;
  const replaceBatchCreateCall = `    const batch = await Batch.create({
      _id: deterministicBatchId,
      name: trimmedName,
      subject,`;

  if (content.includes(targetBatchCreateCall)) {
    content = content.replace(targetBatchCreateCall, replaceBatchCreateCall);
  }

  // Update catch block in createBatch
  const targetBatchCatch = `  } catch (error: any) {
    console.error('Create batch error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;

  const replaceBatchCatch = `  } catch (error: any) {
    console.error('Create batch error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: \`A batch with this name or identifier already exists.\`,
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });
  }`;

  if (content.includes(targetBatchCatch)) {
    content = content.replace(targetBatchCatch, replaceBatchCatch);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ batchController.ts updated');
}

// 2. UPDATE scheduleController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'scheduleController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // In createSchedule, add duplicate checks for batch and teacher
  const targetScheduleChecks = `    const batchId = batch?._id ? batch._id : batch;
    const resolvedAttendance = await resolveScheduleAttendance({
      status: scheduleStatus,
      batchId,
      date: normalizedDate,
      inputAttendance: req.body.attendance,
    });`;

  const replaceScheduleChecks = `    const batchId = batch?._id ? batch._id : batch;

    // Prevent duplicate class schedule for same batch at same date & startTime
    const existingBatchSchedule = await Schedule.findOne({
      batch: batchId,
      date: normalizedDate,
      startTime,
      status: { $ne: 'Cancelled' }
    });
    if (existingBatchSchedule) {
      res.status(409).json({
        message: \`A class for this batch is already scheduled on \${formatDateToYYYYMMDD(normalizedDate)} at \${startTime}.\`,
        isDuplicate: true,
      });
      return;
    }

    // Prevent duplicate teacher assignment at same date & startTime
    const existingTeacherSchedule = await Schedule.findOne({
      teacher: activeTeacherId,
      date: normalizedDate,
      startTime,
      status: { $ne: 'Cancelled' }
    });
    if (existingTeacherSchedule) {
      res.status(409).json({
        message: \`Teacher is already scheduled for another class on \${formatDateToYYYYMMDD(normalizedDate)} at \${startTime}.\`,
        isDuplicate: true,
      });
      return;
    }

    const deterministicSchedId = Boolean(isExtraClass)
      ? \`sched_extra_\${batchId}_\${sDateStr}_\${startTime.replace(':', '')}_\${Date.now()}\`
      : \`sched_\${batchId}_\${sDateStr}_\${startTime.replace(':', '')}\`;

    const resolvedAttendance = await resolveScheduleAttendance({
      status: scheduleStatus,
      batchId,
      date: normalizedDate,
      inputAttendance: req.body.attendance,
    });`;

  if (content.includes(targetScheduleChecks)) {
    content = content.replace(targetScheduleChecks, replaceScheduleChecks);
  }

  // Update Schedule.create call in createSchedule
  const targetScheduleCreateCall = `    const schedule = await Schedule.create({
      teacher: targetTeacherId,
      batch,`;

  const replaceScheduleCreateCall = `    const schedule = await Schedule.create({
      _id: deterministicSchedId,
      teacher: targetTeacherId,
      batch,`;

  if (content.includes(targetScheduleCreateCall)) {
    content = content.replace(targetScheduleCreateCall, replaceScheduleCreateCall);
  }

  // Update catch block in createSchedule
  const targetScheduleCatch = `    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a schedule`;

  const replaceScheduleCatch = `    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A schedule entry for this batch or teacher already exists at this date and time.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a schedule`;

  if (content.includes(targetScheduleCatch)) {
    content = content.replace(targetScheduleCatch, replaceScheduleCatch);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ scheduleController.ts updated');
}

// 3. UPDATE attendanceHelper.ts
{
  const filePath = path.join(__dirname, '..', 'utils', 'attendanceHelper.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // In resolveScheduleAttendance, ensure return array is deduplicated by studentId
  const targetAttendanceReturn = `  // 1. Cancelled class: auto mark all students absent
  if (status === 'Cancelled') {
    return studentIds.map(studentId => createRecord(studentId, false));
  }`;

  const replaceAttendanceReturn = `  const deduplicateRecords = (records: any[]) => {
    const seen = new Set<string>();
    return records.filter(r => {
      const sId = (r.studentId?._id || r.studentId || '').toString();
      if (!sId || seen.has(sId)) return false;
      seen.add(sId);
      return true;
    });
  };

  // 1. Cancelled class: auto mark all students absent
  if (status === 'Cancelled') {
    return deduplicateRecords(studentIds.map(studentId => createRecord(studentId, false)));
  }`;

  if (content.includes(targetAttendanceReturn)) {
    content = content.replace(targetAttendanceReturn, replaceAttendanceReturn);
  }

  const targetCompletedReturn = `      return studentIds.map(studentId => {
        if (statusMap.has(studentId)) {
          const custom = statusMap.get(studentId)!;
          return createRecord(studentId, custom.isPresent, custom.notes);
        }
        return createRecord(studentId, true); // default to present if completed
      });
    }

    // Default for completed: all enrolled students marked present
    return studentIds.map(studentId => createRecord(studentId, true));`;

  const replaceCompletedReturn = `      return deduplicateRecords(studentIds.map(studentId => {
        if (statusMap.has(studentId)) {
          const custom = statusMap.get(studentId)!;
          return createRecord(studentId, custom.isPresent, custom.notes);
        }
        return createRecord(studentId, true); // default to present if completed
      }));
    }

    // Default for completed: all enrolled students marked present
    return deduplicateRecords(studentIds.map(studentId => createRecord(studentId, true)));`;

  if (content.includes(targetCompletedReturn)) {
    content = content.replace(targetCompletedReturn, replaceCompletedReturn);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ attendanceHelper.ts updated');
}

// 4. UPDATE demoSessionController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'demoSessionController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add escapeRegex if needed
  if (!content.includes('function escapeRegex') && !content.includes('const escapeRegex')) {
    content = "const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\\n" + content;
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
    content = content.replace(targetDemoCheck, replaceDemoCheck);
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
    content = content.replace(targetSingleDemoCreate, replaceSingleDemoCreate);
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
    content = content.replace(targetDemoCatch, replaceDemoCatch);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ demoSessionController.ts updated');
}

// 5. UPDATE paymentController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'paymentController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // In createAdmissionPayment, assign deterministic ID when creating new
  const targetPaymentPayload = `    const paymentPayload: any = {
      student: targetStudent ? targetStudent._id : (studentId || null),`;

  const replacePaymentPayload = `    const deterministicPayId = \`pay_\${(targetStudent ? targetStudent._id : studentId) || 'unknown'}_\${targetBatchId || 'admission'}\`;
    const paymentPayload: any = {
      _id: deterministicPayId,
      student: targetStudent ? targetStudent._id : (studentId || null),`;

  if (content.includes(targetPaymentPayload)) {
    content = content.replace(targetPaymentPayload, replacePaymentPayload);
  }

  // In recordPayment, add check for rapid duplicate submissions in paymentHistory
  const targetRecordPaymentHistory = `    const tx = {
      id: crypto.randomUUID(),
      amount,`;

  const replaceRecordPaymentHistory = `    // Prevent duplicate payment entry in paymentHistory
    const txTime = new Date(txDateStr).getTime();
    if (Array.isArray(payment.paymentHistory)) {
      const isDuplicateTx = payment.paymentHistory.some((item: any) => {
        if (transactionId && item.transactionId && item.transactionId.trim() === transactionId.trim()) {
          return true;
        }
        if (Number(item.amount) === amount && item.paymentMethod === (paymentMethod || 'Bank Transfer')) {
          const itemTime = new Date(item.paymentDate || item.createdAt).getTime();
          if (Math.abs(itemTime - txTime) < 5 * 60 * 1000) {
            return true;
          }
        }
        return false;
      });

      if (isDuplicateTx) {
        res.status(409).json({
          message: 'This payment transaction has already been recorded (duplicate entry prevented).',
          isDuplicate: true,
        });
        return;
      }
    }

    const tx = {
      id: crypto.randomUUID(),
      amount,`;

  if (content.includes(targetRecordPaymentHistory)) {
    content = content.replace(targetRecordPaymentHistory, replaceRecordPaymentHistory);
  }

  // Catch blocks in paymentController
  const targetPayCatch1 = `    res.status(500).json({ message: error.message || 'Error recording admission fee' });
  }
};`;

  const replacePayCatch1 = `    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A payment record already exists for this student and batch.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error recording admission fee' });
  }
};`;

  if (content.includes(targetPayCatch1)) {
    content = content.replace(targetPayCatch1, replacePayCatch1);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ paymentController.ts updated');
}

// 6. UPDATE studentController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'studentController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // In createStudent, update 400 to 409 and add deterministic student ID
  const targetStudentDup = `    // 1. Check if already enrolled in this exact batch
    const existingInBatch = await Student.findOne({
      name: { $regex: \`^\\\\s*\${escapeRegex(trimmedName)}\\\\s*$\`, $options: 'i' },
      batch
    });
    if (existingInBatch) {
      res.status(400).json({ message: 'Student already exists in this batch' });
      return;
    }`;

  const replaceStudentDup = `    // 1. Check if already enrolled in this exact batch by name, mobile, or email
    const cleanPhone = mobileNumber ? String(mobileNumber).replace(/\\D/g, '') : '';
    const cleanLast10 = cleanPhone.length >= 8 ? cleanPhone.slice(-10) : '';
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const existingInBatch = await Student.findOne({
      name: { $regex: \`^\\\\s*\${escapeRegex(trimmedName)}\\\\s*$\`, $options: 'i' },
      batch
    });
    if (existingInBatch) {
      res.status(409).json({ message: 'Student already exists in this batch', isDuplicate: true });
      return;
    }

    if (cleanEmail || cleanLast10) {
      const batchStudents = await Student.find({ batch });
      const dupStudent = batchStudents.find((s: any) => {
        if (cleanEmail && s.email && s.email.trim().toLowerCase() === cleanEmail) return true;
        if (cleanLast10 && s.mobileNumber) {
          const sp = String(s.mobileNumber).replace(/\\D/g, '');
          if (sp.length >= 8 && sp.slice(-10) === cleanLast10) return true;
        }
        return false;
      });
      if (dupStudent) {
        res.status(409).json({ message: \`A student with this phone or email already exists in this batch (\${dupStudent.name})\`, isDuplicate: true });
        return;
      }
    }

    const deterministicStudentId = \`stud_\${batch}_\${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '')}\`;`;

  if (content.includes(targetStudentDup)) {
    content = content.replace(targetStudentDup, replaceStudentDup);
  }

  // Update Student.create in createStudent
  const targetStudentCreateCall = `      const newStudent = await Student.create({
        name: trimmedName,
        batch,`;

  const replaceStudentCreateCall = `      const newStudent = await Student.create({
        _id: deterministicStudentId,
        name: trimmedName,
        batch,`;

  if (content.includes(targetStudentCreateCall)) {
    content = content.replace(targetStudentCreateCall, replaceStudentCreateCall);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ studentController.ts updated');
}

// 7. UPDATE teacherController.ts
{
  const filePath = path.join(__dirname, '..', 'controllers', 'teacherController.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // In createTeacher, add phone duplicate check and deterministic ID
  const targetTeacherPhone = `    // Check for duplicate Teacher profile
    const teacherExists = await Teacher.findOne({ email: normalizedEmail });
    if (teacherExists) {
      res.status(400).json({ message: 'Teacher profile with this email already exists' });
      return;
    }`;

  const replaceTeacherPhone = `    // Check for duplicate Teacher profile
    const teacherExists = await Teacher.findOne({ email: normalizedEmail });
    if (teacherExists) {
      res.status(409).json({ message: 'Teacher profile with this email already exists', isDuplicate: true });
      return;
    }

    if (phone) {
      const cleanPhone = String(phone).replace(/\\D/g, '');
      if (cleanPhone.length >= 8) {
        const last10 = cleanPhone.slice(-10);
        const allTeachers = await Teacher.find({}).select('_id name phone');
        const phoneExists = allTeachers.find((t: any) => {
          const p = String(t.phone || '').replace(/\\D/g, '');
          return p.length >= 8 && p.slice(-10) === last10;
        });
        if (phoneExists) {
          res.status(409).json({
            message: \`A teacher with phone number "\${phone}" already exists (\${phoneExists.name}).\`,
            isDuplicate: true,
          });
          return;
        }
      }
    }

    const deterministicTeacherId = \`teacher_\${normalizedEmail.replace(/[^a-z0-9]/g, '_')}\`;`;

  if (content.includes(targetTeacherPhone)) {
    content = content.replace(targetTeacherPhone, replaceTeacherPhone);
  }

  // Update Teacher.create call
  const targetTeacherCreateCall = `    const teacher = await Teacher.create({
      user: user._id,
      name,`;

  const replaceTeacherCreateCall = `    const teacher = await Teacher.create({
      _id: deterministicTeacherId,
      user: user._id,
      name,`;

  if (content.includes(targetTeacherCreateCall)) {
    content = content.replace(targetTeacherCreateCall, replaceTeacherCreateCall);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ teacherController.ts updated');
}
