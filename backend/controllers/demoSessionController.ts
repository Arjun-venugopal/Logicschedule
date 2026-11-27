import { Response } from 'express';
import DemoSession from '../models/DemoSession';
import Teacher from '../models/Teacher';
import Schedule from '../models/Schedule';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Payment from '../models/Payment';
import RecycleBin from '../models/RecycleBin';
import { findExistingStudent, syncStudentBatchSchedules } from './studentController';
import { checkTeacherConflict, getKolkataNow, formatDateToYYYYMMDD } from '../utils/scheduleHelper';
import { serverCache, deleteDiskCache } from '../utils/cache';

// @desc    Get all demo sessions
// @route   GET /demo-sessions
// @access  Private
export const getDemoSessions = async (req: any, res: Response): Promise<void> => {
  try {
    const isTeacher = req.user && req.user.role === 'Teacher';
    const isSales = req.user && req.user.role === 'Sales Person';
    const cacheKey = `demo_sessions_${isTeacher ? `teacher_${req.user._id}` : (isSales ? `sales_${req.user._id}` : 'all')}`;
    const cached = serverCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    let query: any = {};

    // If logged in user is a Teacher, only fetch their demo sessions
    if (isTeacher) {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) {
        query = { teacher: teacher._id };
      } else {
        res.json([]);
        return;
      }
    } else if (isSales) {
      // If logged in user is a Sales Person, fetch their demo sessions (case-insensitive) or unassigned ones
      const escapedName = req.user.name ? req.user.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      query = {
        $or: [
          { createdBy: req.user._id.toString() },
          ...(escapedName ? [{ salesExecutive: { $regex: `^${escapedName}$` } }] : []),
          { salesExecutive: '' },
          { salesExecutive: null }
        ]
      };
    }

    const [demoSessions, allPayments, allStudents] = await Promise.all([
      DemoSession.find(query)
        .sort({ date: -1 })
        .populate('teacher', 'name email status availability'),
      Payment.safeFind({}),
      Student.find({}).select('_id name email mobileNumber phone batch payment'),
    ]);

    // Fast O(1) indexes for payment matching
    const paymentByDemoId = new Map<string, any>();
    const paymentByStudentId = new Map<string, any>();

    for (const p of allPayments) {
      if (p.demoSession) {
        const dsId = (p.demoSession._id || p.demoSession).toString();
        paymentByDemoId.set(dsId, p);
      }
      if (p.student) {
        const sId = (p.student._id || p.student).toString();
        paymentByStudentId.set(sId, p);
      }
    }

    const studentByEmail = new Map<string, any>();
    const studentByPhone = new Map<string, any>();
    const studentByName = new Map<string, any>();
    const studentByBatch = new Map<string, any>();

    for (const s of allStudents) {
      const sId = s._id ? s._id.toString() : '';
      if (s.email) {
        studentByEmail.set(s.email.trim().toLowerCase(), s);
      }
      const phoneDigits = String(s.mobileNumber || s.phone || '').replace(/\D/g, '');
      if (phoneDigits.length >= 8) {
        studentByPhone.set(phoneDigits.slice(-10), s);
      }
      if (s.name) {
        studentByName.set(s.name.trim().toLowerCase(), s);
      }
      if (s.batch) {
        const bId = (s.batch._id || s.batch).toString();
        studentByBatch.set(bId, s);
      }
      if (s.payment && !paymentByStudentId.has(sId)) {
        paymentByStudentId.set(sId, s.payment);
      }
    }

    // Mask fee details for Sales Person if they are not the assigned salesExecutive
    const maskedSessions = demoSessions.map((session: any) => {
      const sessionObj = { ...session };
      sessionObj.status = sessionObj.status || 'Scheduled';

      const sId = session._id ? session._id.toString() : '';
      let matchedPayment = sId ? paymentByDemoId.get(sId) : null;
      let matchedStudent: any = null;

      if (session.studentEmail) {
        matchedStudent = studentByEmail.get(session.studentEmail.trim().toLowerCase());
      }
      if (!matchedStudent && session.phoneNumber) {
        const pClean = String(session.phoneNumber).replace(/\D/g, '');
        if (pClean.length >= 8) {
          matchedStudent = studentByPhone.get(pClean.slice(-10));
        }
      }
      if (!matchedStudent && session.batchAssigned) {
        const bId = (session.batchAssigned._id || session.batchAssigned).toString();
        matchedStudent = studentByBatch.get(bId);
      }
      if (!matchedStudent && session.studentName) {
        matchedStudent = studentByName.get(session.studentName.trim().toLowerCase());
      }

      if (!matchedPayment && matchedStudent) {
        matchedPayment = paymentByStudentId.get(matchedStudent._id.toString());
      }

      if (matchedStudent) {
        sessionObj.studentId = matchedStudent._id.toString();
        if (!sessionObj.studentEmail && matchedStudent.email) sessionObj.studentEmail = matchedStudent.email;
        if (!sessionObj.phoneNumber && matchedStudent.mobileNumber) sessionObj.phoneNumber = matchedStudent.mobileNumber;
      }

      if (matchedPayment) {
        const totalFee = Number(matchedPayment.totalFee) || 0;
        const amountPaid = Number(matchedPayment.amountPaid) || 0;
        const remainingAmount = Math.max(0, totalFee - amountPaid);
        const pType = matchedPayment.paymentType || (remainingAmount <= 0 ? 'Full Payment' : 'Half Payment');
        const pStatus = matchedPayment.paymentStatus || (remainingAmount <= 0 ? 'Paid' : 'Partially Paid');

        sessionObj.payment = {
          _id: matchedPayment._id,
          totalFee,
          amountPaid,
          remainingAmount,
          paymentType: pType,
          paymentStatus: pStatus,
          assignedClasses: matchedPayment.assignedClasses || 15,
          dueAfterClasses: matchedPayment.dueAfterClasses || 5,
          paymentHistory: Array.isArray(matchedPayment.paymentHistory) ? matchedPayment.paymentHistory : [],
          notes: matchedPayment.notes || '',
          salesExecutive: matchedPayment.salesExecutive || sessionObj.salesExecutive || '',
          admissionDate: matchedPayment.admissionDate || '',
          updatedAt: matchedPayment.updatedAt || matchedPayment.createdAt || '',
        };
        sessionObj.paymentStatus = pStatus;
        sessionObj.paymentType = pType;
        sessionObj.remainingAmount = remainingAmount;
      }

      if (req.user && req.user.role === 'Sales Person') {
        const isAssigned = sessionObj.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
        if (!isAssigned) {
          sessionObj.feeDiscussed = 'Hidden';
        }
      }
      return sessionObj;
    });

    maskedSessions.sort((a: any, b: any) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      const validA = isNaN(timeA) ? 0 : timeA;
      const validB = isNaN(timeB) ? 0 : timeB;
      if (validB !== validA) return validB - validA;
      return (b.startTime || '').localeCompare(a.startTime || '');
    });

    serverCache.set(cacheKey, maskedSessions, 30_000);
    res.json(maskedSessions);
  } catch (error: any) {
    console.error('Get demo sessions error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper to normalize phone numbers (strip non-digits, compare last 10 digits)
export function normalizePhone(phone: any): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Helper to normalize strings for case-insensitive matching
export function normalizeStr(str: any): string {
  return String(str || '').trim().toLowerCase();
}

// @desc    Check whether a demo student is already registered across any demo sessions based on phone number
// @route   POST /demo-sessions/check-duplicate
// @access  Private
export const checkDuplicateDemoSession = async (req: any, res: Response): Promise<void> => {
  try {
    const { studentName, phoneNumber, excludeId, students: rawStudents } = req.body;

    const cleanPhone = normalizePhone(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 7) {
      res.json({ hasDuplicate: false, matches: [] });
      return;
    }

    const namesToCheck: string[] = [];
    if (Array.isArray(rawStudents) && rawStudents.length > 0) {
      for (const s of rawStudents) {
        if (s && s.studentName && s.studentName.trim()) {
          namesToCheck.push(s.studentName.trim());
        }
      }
    }
    if (studentName && studentName.trim() && !namesToCheck.includes(studentName.trim())) {
      namesToCheck.unshift(studentName.trim());
    }

    // Query ALL demo sessions across all sales persons and teachers
    const allDemos = await DemoSession.find({}).populate('teacher', 'name email status availability');

    const matchedDemos: any[] = [];
    const seenIds = new Set<string>();

    for (const d of allDemos) {
      const dId = d._id ? d._id.toString() : '';
      if (!dId || seenIds.has(dId)) continue;
      if (excludeId && (dId === excludeId || d._id === excludeId)) continue;

      const dPhone = normalizePhone(d.phoneNumber);
      const phoneMatch = dPhone.length >= 7 && (cleanPhone === dPhone || cleanPhone.endsWith(dPhone) || dPhone.endsWith(cleanPhone));

      // Duplicate check is strictly based on the phone number
      if (!phoneMatch) continue;

      seenIds.add(dId);

      const dName = normalizeStr(d.studentName);
      let nameMatch = false;
      let exactNameMatch = false;

      for (const name of namesToCheck) {
        const cName = normalizeStr(name);
        if (!cName) continue;
        if (cName === dName) {
          exactNameMatch = true;
          nameMatch = true;
          break;
        } else if (cName.length >= 3 && dName.length >= 3 && (cName.includes(dName) || dName.includes(cName))) {
          nameMatch = true;
        }
      }

      // If phone matches and student name matches -> same student duplicate
      // If phone matches but student name differs -> sibling under same parent
      const isExactStudent = nameMatch;
      const isPotentialSibling = !nameMatch;

      const matchReasons: string[] = [
        `Phone Number: "${d.phoneNumber || cleanPhone}"`,
        isExactStudent
          ? (exactNameMatch ? `Exact Student Name: "${d.studentName}"` : `Similar Student Name: "${d.studentName}"`)
          : `Different Student Name: "${d.studentName}" (Sibling)`
      ];

      matchedDemos.push({
        _id: d._id,
        studentName: d.studentName || '',
        customerName: d.customerName || '',
        phoneNumber: d.phoneNumber || '',
        studentEmail: d.studentEmail || '',
        subject: d.subject || '',
        date: d.date,
        startTime: d.startTime || '',
        endTime: d.endTime || '',
        status: d.status || 'Scheduled',
        admissionConfirmed: d.admissionConfirmed || 'Pending',
        teacher: d.teacher,
        salesExecutive: d.salesExecutive || '',
        notes: d.notes || '',
        cancellationReason: d.cancellationReason || '',
        demoHistory: Array.isArray(d.demoHistory) ? d.demoHistory : [],
        createdAt: d.createdAt,
        matchReasons,
        isExactStudent,
        isPotentialSibling,
      });
    }

    // Sort matches: Exact student matches first, then by date descending (most recent first)
    matchedDemos.sort((a, b) => {
      if (a.isExactStudent && !b.isExactStudent) return -1;
      if (!a.isExactStudent && b.isExactStudent) return 1;
      const tA = a.date ? new Date(a.date).getTime() : 0;
      const tB = b.date ? new Date(b.date).getTime() : 0;
      return tB - tA;
    });

    const hasDuplicate = matchedDemos.length > 0;
    const isExactMatch = matchedDemos.some(m => m.isExactStudent);
    const isPotentialSibling = hasDuplicate && !isExactMatch && matchedDemos.some(m => m.isPotentialSibling);

    let message = 'This student is already registered for a demo session under this phone number. Do you want to view the existing record?';
    if (isPotentialSibling) {
      message = 'A demo session with this phone number already exists for another student (potential sibling). Do you want to view the existing record?';
    }

    res.json({
      hasDuplicate,
      isExactMatch,
      isPotentialSibling,
      message,
      matches: matchedDemos,
      existingDemo: matchedDemos[0] || null,
    });
  } catch (error: any) {
    console.error('Check duplicate demo session error:', error.message);
    res.status(500).json({ message: 'Server error checking duplicates', detail: error.message });
  }
};

// Helper to automatically provision batch and student records when demo admission is confirmed
async function provisionBatchAndStudentForDemo(demoSession: any): Promise<void> {
  const isConfirmedOnCreate =
    demoSession.admissionConfirmed === 'Yes' ||
    demoSession.admissionConfirmed === 'Won' ||
    demoSession.admissionConfirmed === 'Teacher is not confirmed' ||
    demoSession.admissionConfirmed === 'Teacher Not Confirmed';

  if (!isConfirmedOnCreate || demoSession.batchAssigned) {
    return;
  }

  const studentCleanName = (demoSession.studentName || '').trim();
  const existingStudent = await findExistingStudent(
    studentCleanName,
    demoSession.studentEmail,
    demoSession.phoneNumber
  );

  const count = await Batch.countDocuments();
  const serialNo = count + 1;
  const batchName = `${studentCleanName} 1:1 ${serialNo}`;

  const isTutorNotConfirmed =
    demoSession.classAssignedTutor === 'Teacher is not confirmed' ||
    demoSession.classAssignedTutor === 'Teacher Not Confirmed' ||
    demoSession.admissionConfirmed === 'Teacher is not confirmed' ||
    demoSession.admissionConfirmed === 'Teacher Not Confirmed';

  const teacherId = isTutorNotConfirmed
    ? undefined
    : (demoSession.classAssignedTutor ||
      (demoSession.teacher && typeof demoSession.teacher === 'object' ? demoSession.teacher._id : demoSession.teacher) ||
      undefined);

  const newBatch = await Batch.create({
    name: batchName,
    subject: demoSession.subject,
    assignedTeacher: teacherId,
    studentsCount: 1,
    status: 'Upcoming',
    timing: { startTime: demoSession.startTime || '09:00', endTime: demoSession.endTime || '10:00' },
    days: [],
    durationType: demoSession.numberOfSessions ? 'Custom' : '1 Month',
    numberOfSessions: demoSession.numberOfSessions || null,
  });

  demoSession.batchAssigned = newBatch._id;
  await demoSession.save();

  if (existingStudent) {
    const oldBatchId = existingStudent.batch?._id ? existingStudent.batch._id.toString() : existingStudent.batch?.toString();
    if (oldBatchId && oldBatchId !== newBatch._id.toString()) {
      if (!existingStudent.pastBatches) existingStudent.pastBatches = [];
      const alreadyInPast = existingStudent.pastBatches.some((pb: any) => {
        const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
        return pbId === oldBatchId;
      });
      if (!alreadyInPast) {
        existingStudent.pastBatches.push({
          batch: oldBatchId,
          leftAt: new Date(),
        });
      }
      await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
    }

    existingStudent.batch = newBatch._id;
    if (demoSession.customerName && !existingStudent.parentName) existingStudent.parentName = demoSession.customerName;
    if (demoSession.phoneNumber && !existingStudent.mobileNumber) existingStudent.mobileNumber = demoSession.phoneNumber;
    if (demoSession.studentEmail && !existingStudent.email) existingStudent.email = demoSession.studentEmail;
    if (studentCleanName) existingStudent.name = studentCleanName;
    await existingStudent.save();
  } else {
    await Student.create({
      name: studentCleanName,
      batch: newBatch._id,
      parentName: demoSession.customerName || '',
      mobileNumber: demoSession.phoneNumber || '',
      email: demoSession.studentEmail || '',
    });
  }
}

// @desc    Create a demo session
// @route   POST /demo-sessions
// @access  Private/Admin
export const createDemoSession = async (req: any, res: Response): Promise<void> => {
  try {
    const {
      teacher: rawTeacher, studentName, studentEmail, subject, date, startTime, endTime, meetingLink, notes,
      customerName, phoneNumber, place, age, feeDiscussed, admissionConfirmed, salesExecutive, classAssignedTutor, batchAssigned, numberOfSessions,
      students: rawStudents
    } = req.body;

    // Treat 'unassigned' as null (no teacher)
    const teacher = rawTeacher === 'unassigned' ? null : rawTeacher;

    // Parse multi-student list if provided
    const validStudents = Array.isArray(rawStudents)
      ? rawStudents
          .filter((s: any) => s && s.studentName && s.studentName.trim().length > 0)
          .map((s: any) => ({
            studentName: s.studentName.trim(),
            studentEmail: s.studentEmail ? s.studentEmail.trim() : (studentEmail || ''),
            age: s.age !== undefined && s.age !== '' ? Number(s.age) : (age || null),
            subject: s.subject && s.subject.trim() ? s.subject.trim() : subject,
          }))
      : [];

    const effectiveStudentName = validStudents.length > 0 ? validStudents[0].studentName : studentName;

    if (!effectiveStudentName || (!subject && req.body.status !== 'Cancelled') || !date || !startTime || !endTime) {
      res.status(400).json({ message: 'Please provide all required fields: studentName, subject, date, startTime, endTime' });
      return;
    }

    const dateObj = new Date(date);

    // Comprehensive Phone-Based Duplicate Check:
    // Before creating, check whether this phone number is already registered across any salesperson or demo.
    if (!req.body.allowDuplicate) {
      const cleanTargetPhone = normalizePhone(phoneNumber);
      const cleanTargetName = normalizeStr(effectiveStudentName);

      if (cleanTargetPhone && cleanTargetPhone.length >= 7) {
        const allExisting = await DemoSession.find({}).populate('teacher', 'name email status availability');
        const matches: any[] = [];

        for (const d of allExisting) {
          const dPhone = normalizePhone(d.phoneNumber);
          const phoneMatch = dPhone.length >= 7 && (cleanTargetPhone === dPhone || cleanTargetPhone.endsWith(dPhone) || dPhone.endsWith(cleanTargetPhone));
          if (!phoneMatch) continue;

          const dName = normalizeStr(d.studentName);
          const exactName = cleanTargetName.length > 0 && dName.length > 0 && cleanTargetName === dName;
          const nameMatch = cleanTargetName.length > 0 && dName.length > 0 && (exactName || dName.includes(cleanTargetName) || cleanTargetName.includes(dName));

          const isExactStudent = nameMatch;
          const isPotentialSibling = !nameMatch;

          const matchReasons: string[] = [
            `Phone Number: "${d.phoneNumber || cleanTargetPhone}"`,
            isExactStudent
              ? (exactName ? `Exact Student Name: "${d.studentName}"` : `Similar Student Name: "${d.studentName}"`)
              : `Different Student Name: "${d.studentName}" (Sibling)`
          ];

          matches.push({
            _id: d._id,
            studentName: d.studentName || '',
            customerName: d.customerName || '',
            phoneNumber: d.phoneNumber || '',
            studentEmail: d.studentEmail || '',
            subject: d.subject || '',
            date: d.date,
            startTime: d.startTime || '',
            endTime: d.endTime || '',
            status: d.status || 'Scheduled',
            admissionConfirmed: d.admissionConfirmed || 'Pending',
            teacher: d.teacher,
            salesExecutive: d.salesExecutive || '',
            notes: d.notes || '',
            cancellationReason: d.cancellationReason || '',
            demoHistory: Array.isArray(d.demoHistory) ? d.demoHistory : [],
            createdAt: d.createdAt,
            matchReasons,
            isExactStudent,
            isPotentialSibling,
          });
        }

        if (matches.length > 0) {
          matches.sort((a, b) => {
            if (a.isExactStudent && !b.isExactStudent) return -1;
            if (!a.isExactStudent && b.isExactStudent) return 1;
            const tA = a.date ? new Date(a.date).getTime() : 0;
            const tB = b.date ? new Date(b.date).getTime() : 0;
            return tB - tA;
          });

          const hasExact = matches.some(m => m.isExactStudent);
          const isPotentialSibling = !hasExact && matches.some(m => m.isPotentialSibling);

          res.status(409).json({
            message: isPotentialSibling
              ? 'A demo session with this phone number already exists for another student (potential sibling). Do you want to view the existing record?'
              : 'This student is already registered for a demo session under this phone number. Do you want to view the existing record?',
            isDuplicate: true,
            requiresConfirmation: true,
            isPotentialSibling,
            existingDemo: matches[0],
            matches,
          });
          return;
        }
      }
    }

    // Prevent duplicate demo booking for the same student on the same date and startTime
    if (phoneNumber && !req.body.allowDuplicate) {
      const cleanPhone = normalizePhone(phoneNumber);
      if (cleanPhone && cleanPhone.length >= 7) {
        const sameSlotDemos = await DemoSession.find({
          date: dateObj,
          startTime,
          status: { $ne: 'Cancelled' }
        });
        for (const s of sameSlotDemos) {
          const sPhone = normalizePhone(s.phoneNumber);
          if (sPhone && (sPhone === cleanPhone || cleanPhone.endsWith(sPhone) || sPhone.endsWith(cleanPhone))) {
            const sName = normalizeStr(s.studentName);
            const tName = normalizeStr(effectiveStudentName);
            if (sName === tName) {
              res.status(409).json({
                message: `A demo session for "${effectiveStudentName}" is already scheduled on ${formatDateToYYYYMMDD(dateObj)} at ${startTime}.`,
                isDuplicate: true,
              });
              return;
            }
          }
        }
      }
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
          message: `This teacher is already booked for a demo session on ${formatDateToYYYYMMDD(dateObj)} at ${startTime}.`,
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
    }

    // MULTI-STUDENT BOOKING (Single parent booking for 2 or more children)
    if (validStudents.length > 1) {
      const groupBookingId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const allStudentNames = validStudents.map((s: any) => s.studentName);
      const createdSessions: any[] = [];

      for (let i = 0; i < validStudents.length; i++) {
        const currentStudent = validStudents[i];
        const siblingNamesList = allStudentNames.filter((n: string) => n !== currentStudent.studentName);
        const siblingNote = `Sibling of ${siblingNamesList.join(', ')}`;
        const studentNotes = notes ? `${notes} • ${siblingNote}` : siblingNote;

        const sessionDoc = await DemoSession.create({
          teacher: teacher || null,
          studentName: currentStudent.studentName,
          studentEmail: currentStudent.studentEmail || '',
          customerName: customerName || '',
          phoneNumber: phoneNumber || '',
          place: place || '',
          age: currentStudent.age,
          feeDiscussed,
          admissionConfirmed: admissionConfirmed || 'Pending',
          salesExecutive: salesExecutive || '',
          classAssignedTutor: classAssignedTutor || undefined,
          batchAssigned: undefined,
          subject: currentStudent.subject || subject,
          date: dateObj,
          startTime,
          endTime,
          status: req.body.status || 'Scheduled',
          meetingLink: meetingLink || '',
          notes: studentNotes,
          cancellationReason: req.body.cancellationReason || '',
          conflict: isConflict,
          numberOfSessions: numberOfSessions !== undefined ? numberOfSessions : null,
          createdBy: req.user ? req.user._id.toString() : null,
          groupBookingId,
          siblingCount: validStudents.length,
          siblingNames: allStudentNames,
        });

        await provisionBatchAndStudentForDemo(sessionDoc);
        const populated = await sessionDoc.populate('teacher', 'name email status availability');
        createdSessions.push(populated);
      }

      serverCache.clearPattern('demo_sessions_');
      serverCache.delete('teachers_all');
      serverCache.clearPattern('stats_');
      deleteDiskCache('demo_sessions_all');

      const primaryResponse = { ...createdSessions[0] };
      if (req.user && req.user.role === 'Sales Person') {
        const isAssigned = primaryResponse.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
        if (!isAssigned) {
          primaryResponse.feeDiscussed = 'Hidden';
        }
      }

      res.status(201).json({
        message: `${createdSessions.length} demo sessions scheduled successfully for siblings`,
        sessions: createdSessions,
        groupBookingId,
        ...primaryResponse,
      });
      return;
    }

    // SINGLE STUDENT BOOKING (Standard / Existing Flow)
    const idSalt = req.body.allowDuplicate ? `_${Date.now()}` : '';
    const deterministicDemoId = `demo_${(teacher ? (typeof teacher === 'object' ? teacher._id : teacher) : 'unassigned')}_${effectiveStudentName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${formatDateToYYYYMMDD(dateObj)}_${startTime.replace(':', '')}${idSalt}`;
    const demoSession = await DemoSession.create({
      _id: deterministicDemoId,
      teacher: teacher || null,
      studentName: effectiveStudentName,
      studentEmail: (validStudents[0]?.studentEmail) || studentEmail || '',
      customerName: customerName || '',
      phoneNumber: phoneNumber || '',
      place: place || '',
      age: (validStudents[0]?.age !== undefined && validStudents[0]?.age !== null) ? validStudents[0].age : age,
      feeDiscussed,
      admissionConfirmed: admissionConfirmed || 'Pending',
      salesExecutive: salesExecutive || '',
      classAssignedTutor: classAssignedTutor || undefined,
      batchAssigned: batchAssigned || undefined,
      subject: (validStudents[0]?.subject) || subject,
      date: dateObj,
      startTime,
      endTime,
      status: req.body.status || 'Scheduled',
      meetingLink: meetingLink || '',
      notes: notes || '',
      cancellationReason: req.body.cancellationReason || '',
      conflict: isConflict,
      numberOfSessions: numberOfSessions !== undefined ? numberOfSessions : null,
      createdBy: req.user ? req.user._id.toString() : null,
    });

    await provisionBatchAndStudentForDemo(demoSession);

    const populated = await demoSession.populate('teacher', 'name email status availability');

    // Mask fee details for response
    const responseObj = { ...populated };
    if (req.user && req.user.role === 'Sales Person') {
      const isAssigned = responseObj.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
      if (!isAssigned) {
        responseObj.feeDiscussed = 'Hidden';
      }
    }

    serverCache.clearPattern('demo_sessions_');
    serverCache.delete('teachers_all');
    serverCache.clearPattern('stats_');
    deleteDiskCache('demo_sessions_all');
    res.status(201).json(responseObj);
  } catch (error: any) {
    console.error('Create demo session error:', error.message);
    if (error.code === '23505' || error.isDuplicate) {
      res.status(409).json({
        message: 'A demo booking already exists for this student or slot at this date and time.',
        isDuplicate: true,
      });
      return;
    }
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a demo session
// @route   PUT /demo-sessions/:id
// @access  Private
export const updateDemoSession = async (req: any, res: Response): Promise<void> => {
  try {
    const demoSession = await DemoSession.findById(req.params.id);

    if (!demoSession) {
      res.status(404).json({ message: 'Demo session not found' });
      return;
    }

    const previousAdmissionConfirmed = demoSession.admissionConfirmed;

    const isFullAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin';
    const isPermittedSubAdmin = req.user?.role === 'Sub Admin' && req.user?.permissions?.demoSessions?.write === true;
    const isAdmin = isFullAdmin || isPermittedSubAdmin;
    const isSalesPerson = req.user?.role === 'Sales Person';
    let isAssignedTeacher = false;

    if (req.user?._id) {
      const teacherProfile = await Teacher.findOne({ user: req.user._id });
      const sessionTeacherId = (demoSession.teacher && typeof demoSession.teacher === 'object' && demoSession.teacher._id)
        ? demoSession.teacher._id.toString()
        : demoSession.teacher ? demoSession.teacher.toString() : null;

      if (
        (teacherProfile && sessionTeacherId && sessionTeacherId === teacherProfile._id.toString()) ||
        (teacherProfile && sessionTeacherId && sessionTeacherId === teacherProfile.user?.toString()) ||
        (sessionTeacherId && sessionTeacherId === req.user._id.toString())
      ) {
        isAssignedTeacher = true;
      }
    }

    if (!isAdmin && !isAssignedTeacher && !isSalesPerson) {
      res.status(403).json({ message: 'Not authorized to update this demo session' });
      return;
    }

    // -------------------------------------------------------------
    // History Preservation (Requirements 5 & 7):
    // Maintain all previous demo history (previous dates, assigned
    // salesperson, demo status, teacher, and follow-up records).
    // -------------------------------------------------------------
    const hasDateChanged = req.body.date && formatDateToYYYYMMDD(new Date(req.body.date)) !== formatDateToYYYYMMDD(new Date(demoSession.date));
    const hasTimeChanged = (req.body.startTime && req.body.startTime !== demoSession.startTime) || (req.body.endTime && req.body.endTime !== demoSession.endTime);
    const hasStatusChanged = req.body.status && req.body.status !== demoSession.status;
    const hasTeacherChanged = req.body.teacher !== undefined && String(req.body.teacher === 'unassigned' ? '' : req.body.teacher) !== String(demoSession.teacher?._id || demoSession.teacher || '');
    const hasSalesChanged = req.body.salesExecutive !== undefined && req.body.salesExecutive !== demoSession.salesExecutive;
    const isExplicitReschedule = req.body.status === 'Rescheduled' || req.body.isReschedule === true || req.body.rescheduleReason;

    if (hasDateChanged || hasTimeChanged || isExplicitReschedule || hasStatusChanged || hasTeacherChanged || hasSalesChanged) {
      if (!Array.isArray(demoSession.demoHistory)) {
        demoSession.demoHistory = [];
      }

      const historyEntry = {
        date: demoSession.date,
        startTime: demoSession.startTime,
        endTime: demoSession.endTime,
        teacher: demoSession.teacher ? (typeof demoSession.teacher === 'object' ? (demoSession.teacher.name || demoSession.teacher._id) : demoSession.teacher) : null,
        salesExecutive: demoSession.salesExecutive || '',
        status: demoSession.status || 'Scheduled',
        notes: demoSession.notes || '',
        cancellationReason: demoSession.cancellationReason || '',
        reason: req.body.rescheduleReason || req.body.updateReason || (isExplicitReschedule ? 'Rescheduled to new date/time' : 'Demo session details updated'),
        updatedAt: new Date(),
        updatedBy: req.user ? { _id: req.user._id, name: req.user.name, role: req.user.role } : null
      };

      demoSession.demoHistory.push(historyEntry);
      demoSession.rescheduledCount = (demoSession.rescheduledCount || 0) + (isExplicitReschedule || hasDateChanged ? 1 : 0);
    }

    if (req.body.followUpNote && typeof req.body.followUpNote === 'string' && req.body.followUpNote.trim()) {
      const followUpText = `[${new Date().toLocaleDateString('en-GB')}] ${req.user?.name || 'Admin'}: ${req.body.followUpNote.trim()}`;
      demoSession.notes = demoSession.notes ? `${demoSession.notes}\n${followUpText}` : followUpText;
    }

    if (isAdmin || isSalesPerson) {
      demoSession.studentName = req.body.studentName || demoSession.studentName;
      demoSession.studentEmail = req.body.studentEmail !== undefined ? req.body.studentEmail : demoSession.studentEmail;
      demoSession.customerName = req.body.customerName !== undefined ? req.body.customerName : demoSession.customerName;
      demoSession.phoneNumber = req.body.phoneNumber !== undefined ? req.body.phoneNumber : demoSession.phoneNumber;
      demoSession.place = req.body.place !== undefined ? req.body.place : demoSession.place;
      demoSession.age = req.body.age !== undefined ? req.body.age : demoSession.age;

      if (req.body.feeDiscussed !== undefined && req.body.feeDiscussed !== 'Hidden') {
        demoSession.feeDiscussed = req.body.feeDiscussed;
      }

      demoSession.admissionConfirmed = req.body.admissionConfirmed || demoSession.admissionConfirmed;
      demoSession.salesExecutive = req.body.salesExecutive !== undefined ? req.body.salesExecutive : demoSession.salesExecutive;
      demoSession.classAssignedTutor = req.body.classAssignedTutor !== undefined ? req.body.classAssignedTutor : demoSession.classAssignedTutor;
      demoSession.batchAssigned = req.body.batchAssigned !== undefined ? req.body.batchAssigned : demoSession.batchAssigned;
      demoSession.numberOfSessions = req.body.numberOfSessions !== undefined ? req.body.numberOfSessions : demoSession.numberOfSessions;

      demoSession.subject = req.body.subject || demoSession.subject;
      if (req.body.teacher !== undefined) {
        demoSession.teacher = req.body.teacher === 'unassigned' ? null : (req.body.teacher || demoSession.teacher);
      }
      demoSession.date = req.body.date ? new Date(req.body.date) : demoSession.date;
      demoSession.startTime = req.body.startTime || demoSession.startTime;
      demoSession.endTime = req.body.endTime || demoSession.endTime;

      if (req.body.status !== undefined) {
        demoSession.status = req.body.status;
      } else if (!demoSession.status) {
        demoSession.status = 'Scheduled';
      }

      demoSession.meetingLink = req.body.meetingLink !== undefined ? req.body.meetingLink : demoSession.meetingLink;
      demoSession.notes = req.body.notes !== undefined ? req.body.notes : demoSession.notes;
      demoSession.cancellationReason = req.body.cancellationReason !== undefined ? req.body.cancellationReason : demoSession.cancellationReason;

      // Recalculate conflict for this demo session
      const currentTeacherId = (demoSession.teacher && typeof demoSession.teacher === 'object' && demoSession.teacher._id)
        ? demoSession.teacher._id.toString()
        : (demoSession.teacher ? demoSession.teacher.toString() : null);

      if (currentTeacherId && demoSession.status !== 'Cancelled' && demoSession.date && demoSession.startTime && demoSession.endTime) {
        const dateObj = demoSession.date instanceof Date ? demoSession.date : new Date(demoSession.date);
        const conflictRes = await checkTeacherConflict({
          teacherId: currentTeacherId,
          date: dateObj,
          startTime: demoSession.startTime,
          endTime: demoSession.endTime,
          excludeDemoId: demoSession._id.toString(),
        });
        demoSession.conflict = conflictRes.hasConflict;
      } else {
        demoSession.conflict = false;
      }
    } else {
      // Teacher edits: allowed to change status, meetingLink, notes, cancellationReason, date, startTime, endTime
      if (req.body.status !== undefined) demoSession.status = req.body.status;
      else if (!demoSession.status) demoSession.status = 'Scheduled';

      if (req.body.date !== undefined) demoSession.date = new Date(req.body.date);
      if (req.body.startTime !== undefined) demoSession.startTime = req.body.startTime;
      if (req.body.endTime !== undefined) demoSession.endTime = req.body.endTime;
      if (req.body.meetingLink !== undefined) demoSession.meetingLink = req.body.meetingLink;
      if (req.body.notes !== undefined) demoSession.notes = req.body.notes;
      if (req.body.cancellationReason !== undefined) demoSession.cancellationReason = req.body.cancellationReason;

      // Recalculate conflict for this demo session
      const teacherEditorTeacherId = (demoSession.teacher && typeof demoSession.teacher === 'object' && demoSession.teacher._id)
        ? demoSession.teacher._id.toString()
        : (demoSession.teacher ? demoSession.teacher.toString() : null);

      if (teacherEditorTeacherId && demoSession.status !== 'Cancelled' && demoSession.date && demoSession.startTime && demoSession.endTime) {
        const dateObj = demoSession.date instanceof Date ? demoSession.date : new Date(demoSession.date);
        const conflictRes = await checkTeacherConflict({
          teacherId: teacherEditorTeacherId,
          date: dateObj,
          startTime: demoSession.startTime,
          endTime: demoSession.endTime,
          excludeDemoId: demoSession._id.toString(),
        });
        demoSession.conflict = conflictRes.hasConflict;
      } else {
        demoSession.conflict = false;
      }
    }

    const updated = await demoSession.save();

    // Check if admission was newly confirmed and transfer to batch module
    const isNowConfirmed = updated.admissionConfirmed === 'Yes' || updated.admissionConfirmed === 'Won' || updated.admissionConfirmed === 'Teacher is not confirmed' || updated.admissionConfirmed === 'Teacher Not Confirmed';
    const wasConfirmed = previousAdmissionConfirmed === 'Yes' || previousAdmissionConfirmed === 'Won' || previousAdmissionConfirmed === 'Teacher is not confirmed' || previousAdmissionConfirmed === 'Teacher Not Confirmed';
    if ((isAdmin || isSalesPerson) && isNowConfirmed && !wasConfirmed) {
      if (!updated.batchAssigned) {
        const studentCleanName = (updated.studentName || '').trim();
        const existingStudent = await findExistingStudent(
          studentCleanName,
          updated.studentEmail,
          updated.phoneNumber
        );

        const count = await Batch.countDocuments();
        const serialNo = count + 1;
        const batchName = `${studentCleanName} 1:1 ${serialNo}`;

        const isTutorNotConfirmed = updated.classAssignedTutor === 'Teacher is not confirmed' || updated.classAssignedTutor === 'Teacher Not Confirmed' || updated.admissionConfirmed === 'Teacher is not confirmed' || updated.admissionConfirmed === 'Teacher Not Confirmed';
        const teacherId = isTutorNotConfirmed
          ? undefined
          : (updated.classAssignedTutor
            || (updated.teacher && typeof updated.teacher === 'object' ? updated.teacher._id : updated.teacher)
            || undefined);

        const newBatch = await Batch.create({
          name: batchName,
          subject: updated.subject,
          assignedTeacher: teacherId,
          studentsCount: 1,
          status: 'Upcoming',
          timing: { startTime: updated.startTime || '09:00', endTime: updated.endTime || '10:00' },
          days: [],
          durationType: updated.numberOfSessions ? 'Custom' : '1 Month',
          numberOfSessions: updated.numberOfSessions || null,
        });

        updated.batchAssigned = newBatch._id;
        await updated.save();

        const assignedTutorId = teacherId || (newBatch.assignedTeacher?._id ? newBatch.assignedTeacher._id.toString() : newBatch.assignedTeacher);

        if (existingStudent) {
          // Advance/move existing student to new batch without duplicating!
          const oldBatchId = existingStudent.batch?._id ? existingStudent.batch._id.toString() : existingStudent.batch?.toString();
          if (oldBatchId && oldBatchId !== newBatch._id.toString()) {
            if (!existingStudent.pastBatches) existingStudent.pastBatches = [];
            const alreadyInPast = existingStudent.pastBatches.some((pb: any) => {
              const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
              return pbId === oldBatchId;
            });
            if (!alreadyInPast) {
              existingStudent.pastBatches.push({
                batch: oldBatchId,
                leftAt: new Date(),
              });
            }
            await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
          }

          existingStudent.batch = newBatch._id;
          if (assignedTutorId) existingStudent.assignedTutor = assignedTutorId;
          if (updated.customerName && !existingStudent.parentName) existingStudent.parentName = updated.customerName;
          if (updated.phoneNumber && !existingStudent.mobileNumber) existingStudent.mobileNumber = updated.phoneNumber;
          if (updated.studentEmail && !existingStudent.email) existingStudent.email = updated.studentEmail;
          if (studentCleanName) existingStudent.name = studentCleanName;
          await existingStudent.save();
          await syncStudentBatchSchedules(existingStudent._id.toString(), newBatch._id.toString(), oldBatchId);
        } else {
          const createdSt = await Student.create({
            name: studentCleanName,
            batch: newBatch._id,
            parentName: updated.customerName || '',
            mobileNumber: updated.phoneNumber || '',
            email: updated.studentEmail || '',
            assignedTutor: assignedTutorId || undefined,
          });
          await syncStudentBatchSchedules(createdSt._id.toString(), newBatch._id.toString());
        }
      }
    } else if ((isAdmin || isSalesPerson) && isNowConfirmed && updated.batchAssigned) {
      // If batch was already created (e.g. while teacher was not confirmed) and tutor is now selected:
      if (updated.classAssignedTutor && updated.classAssignedTutor !== 'Teacher is not confirmed' && updated.classAssignedTutor !== 'Teacher Not Confirmed') {
        const bDoc = await Batch.findById(updated.batchAssigned);
        if (bDoc) {
          bDoc.assignedTeacher = updated.classAssignedTutor;
          await bDoc.save();
          const batchStudents = await Student.find({ batch: bDoc._id });
          for (let i = 0; i < batchStudents.length; i += 10) {
            await Promise.all(
              batchStudents.slice(i, i + 10).map((bs: any) => {
                bs.assignedTutor = updated.classAssignedTutor;
                return bs.save();
              })
            );
          }
          const kolkata = getKolkataNow();
          const todayStart = new Date(`${kolkata.todayStr}T00:00:00.000Z`);
          const futureScheds = await Schedule.find({ batch: bDoc._id, status: 'Scheduled', date: { $gte: todayStart } });
          for (let i = 0; i < futureScheds.length; i += 10) {
            await Promise.all(
              futureScheds.slice(i, i + 10).map((fs: any) => {
                fs.teacher = updated.classAssignedTutor;
                return fs.save();
              })
            );
          }
          serverCache.clearPattern('schedules_');
          serverCache.clearPattern('students_');
          serverCache.clearPattern('batches_');
          serverCache.clearPattern('stats_');
          deleteDiskCache('schedules_all');
        }
      }
    }

    const populated = await updated.populate('teacher', 'name email status availability');

    // Mask fee details for response
    const responseObj = { ...populated };
    if (req.user && req.user.role === 'Sales Person') {
      const isAssigned = responseObj.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
      if (!isAssigned) {
        responseObj.feeDiscussed = 'Hidden';
      }
    }

    serverCache.clearPattern('demo_sessions_');
    serverCache.delete('teachers_all');
    serverCache.clearPattern('stats_');
    res.json(responseObj);
  } catch (error: any) {
    console.error('Update demo session error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a demo session
// @route   DELETE /demo-sessions/:id
// @access  Private/Admin
export const deleteDemoSession = async (req: any, res: Response): Promise<void> => {
  try {
    const demoSession = await DemoSession.findById(req.params.id);

    if (demoSession) {
      const isFullAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin';
    const isPermittedSubAdmin = req.user?.role === 'Sub Admin' && req.user?.permissions?.demoSessions?.write === true;
    const isAdmin = isFullAdmin || isPermittedSubAdmin;
      const isOwnerSales = req.user?.role === 'Sales Person' &&
        (demoSession.createdBy === req.user?._id?.toString() || demoSession.salesExecutive?.trim().toLowerCase() === req.user?.name?.trim().toLowerCase());

      if (!isAdmin && !isOwnerSales) {
        res.status(403).json({ message: 'Not authorized to delete this demo session' });
        return;
      }

      await RecycleBin.addToBin({
        entityType: 'demoSession',
        entityId: demoSession._id,
        name: `Demo (${demoSession.studentName || demoSession.student || 'Session'} - ${demoSession.subject || 'Demo'})`,
        secondaryInfo: `Date: ${demoSession.date || ''} • Status: ${demoSession.status || ''}`,
        itemData: demoSession,
        deletedBy: req.user,
      });

      await DemoSession.deleteOne({ _id: demoSession._id });
      serverCache.clearPattern('demo_sessions_');
      serverCache.delete('teachers_all');
      serverCache.clearPattern('stats_');
      res.json({ message: 'Demo session moved to Recycle Bin' });
    } else {
      res.status(404).json({ message: 'Demo session not found' });
    }
  } catch (error: any) {
    console.error('Delete demo session error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};
