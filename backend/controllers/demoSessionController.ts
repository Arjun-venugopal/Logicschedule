import { Response } from 'express';
import DemoSession from '../models/DemoSession';
import Teacher from '../models/Teacher';
import Schedule from '../models/Schedule';
import Student from '../models/Student';
import Batch from '../models/Batch';

// @desc    Get all demo sessions
// @route   GET /demo-sessions
// @access  Private
export const getDemoSessions = async (req: any, res: Response): Promise<void> => {
  try {
    let query: any = {};

    // If logged in user is a Teacher, only fetch their demo sessions
    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) {
        query = { teacher: teacher._id };
      } else {
        res.json([]);
        return;
      }
    } else if (req.user && req.user.role === 'Sales Person') {
      // If logged in user is a Sales Person, only fetch their demo sessions
      query = {
        $or: [
          { createdBy: req.user._id.toString() },
          { salesExecutive: req.user.name }
        ]
      };
    }

    const demoSessions = await DemoSession.find(query)
      .populate('teacher', 'name email status availability');

    // Mask fee details for Sales Person if they are not the assigned salesExecutive
    const maskedSessions = demoSessions.map((session: any) => {
      const sessionObj = { ...session };
      if (req.user && req.user.role === 'Sales Person') {
        const isAssigned = sessionObj.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
        if (!isAssigned) {
          sessionObj.feeDiscussed = 'Hidden';
        }
      }
      return sessionObj;
    });

    res.json(maskedSessions);
  } catch (error: any) {
    console.error('Get demo sessions error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a demo session
// @route   POST /demo-sessions
// @access  Private/Admin
export const createDemoSession = async (req: any, res: Response): Promise<void> => {
  try {
    const {
      teacher: rawTeacher, studentName, studentEmail, subject, date, startTime, endTime, meetingLink, notes,
      customerName, phoneNumber, place, age, feeDiscussed, admissionConfirmed, salesExecutive, classAssignedTutor, batchAssigned, numberOfSessions
    } = req.body;

    // Treat 'unassigned' as null (no teacher)
    const teacher = rawTeacher === 'unassigned' ? null : rawTeacher;

    if (!studentName || (!subject && req.body.status !== 'Cancelled') || !date || !startTime || !endTime) {
      res.status(400).json({ message: 'Please provide all required fields: studentName, subject, date, startTime, endTime' });
      return;
    }

    const dateObj = new Date(date);

    let isConflict = false;

    // Only check conflicts if a teacher is assigned
    if (teacher) {
      // Check conflict with regular schedules
      const scheduleConflict = await Schedule.findOne({
        teacher,
        date: dateObj,
        status: { $ne: 'Cancelled' },
        $or: [
          { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
        ],
      });

      // Check conflict with other demo sessions
      const demoConflict = await DemoSession.findOne({
        teacher,
        date: dateObj,
        status: { $ne: 'Cancelled' },
        $or: [
          { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
        ],
      });

      isConflict = !!scheduleConflict || !!demoConflict;
    }

    const demoSession = await DemoSession.create({
      teacher: teacher || null,
      studentName,
      studentEmail: studentEmail || '',
      customerName: customerName || '',
      phoneNumber: phoneNumber || '',
      place: place || '',
      age,
      feeDiscussed,
      admissionConfirmed: admissionConfirmed || 'Pending',
      salesExecutive: salesExecutive || '',
      classAssignedTutor: classAssignedTutor || undefined,
      batchAssigned: batchAssigned || undefined,
      subject,
      date: dateObj,
      startTime,
      endTime,
      meetingLink: meetingLink || '',
      notes: notes || '',
      cancellationReason: req.body.cancellationReason || '',
      conflict: isConflict,
      numberOfSessions: numberOfSessions !== undefined ? numberOfSessions : null,
      createdBy: req.user ? req.user._id.toString() : null,
    });

    if (demoSession.admissionConfirmed === 'Yes' || demoSession.admissionConfirmed === 'Won') {
      if (!demoSession.batchAssigned) {
        const studentQuery: any = { name: demoSession.studentName };
        if (demoSession.studentEmail && demoSession.studentEmail.trim()) {
          studentQuery.email = demoSession.studentEmail.trim();
        }
        const existingStudent = await Student.findOne(studentQuery);
        if (!existingStudent || !existingStudent.batch) {
          const count = await Batch.countDocuments();
          const serialNo = count + 1;
          const batchName = `${demoSession.studentName} 1:1 ${serialNo}`;

          const teacherId = demoSession.classAssignedTutor 
            || (demoSession.teacher && typeof demoSession.teacher === 'object' ? demoSession.teacher._id : demoSession.teacher)
            || undefined;

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

          await Student.create({
            name: demoSession.studentName,
            batch: newBatch._id,
            parentName: demoSession.customerName || '',
            mobileNumber: demoSession.phoneNumber || '',
            email: demoSession.studentEmail || '',
          });
        }
      }
    }

    const populated = await demoSession.populate('teacher', 'name email status availability');

    // Mask fee details for response
    const responseObj = { ...populated };
    if (req.user && req.user.role === 'Sales Person') {
      const isAssigned = responseObj.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
      if (!isAssigned) {
        responseObj.feeDiscussed = 'Hidden';
      }
    }

    res.status(201).json(responseObj);
  } catch (error: any) {
    console.error('Create demo session error:', error.message);
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

    const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin' || req.user?.role === 'Sub Admin';
    const isOwnerSales = req.user?.role === 'Sales Person' &&
      (demoSession.createdBy === req.user?._id?.toString() || demoSession.salesExecutive === req.user?.name);
    let isAssignedTeacher = false;

    if (req.user?._id) {
      const teacherProfile = await Teacher.findOne({ user: req.user._id });
      const sessionTeacherId = (demoSession.teacher && typeof demoSession.teacher === 'object' && demoSession.teacher._id)
        ? demoSession.teacher._id.toString()
        : demoSession.teacher ? demoSession.teacher.toString() : null;

      if (teacherProfile && sessionTeacherId && sessionTeacherId === teacherProfile._id.toString()) {
        isAssignedTeacher = true;
      }
    }

    if (!isAdmin && !isAssignedTeacher && !isOwnerSales) {
      res.status(403).json({ message: 'Not authorized to update this demo session' });
      return;
    }

    if (isAdmin || isOwnerSales) {
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
      demoSession.classAssignedTutor = req.body.classAssignedTutor || demoSession.classAssignedTutor;
      demoSession.batchAssigned = req.body.batchAssigned || demoSession.batchAssigned;
      demoSession.numberOfSessions = req.body.numberOfSessions !== undefined ? req.body.numberOfSessions : demoSession.numberOfSessions;

      demoSession.subject = req.body.subject || demoSession.subject;
      if (req.body.teacher !== undefined) {
        demoSession.teacher = req.body.teacher === 'unassigned' ? null : (req.body.teacher || demoSession.teacher);
      }
      demoSession.date = req.body.date ? new Date(req.body.date) : demoSession.date;
      demoSession.startTime = req.body.startTime || demoSession.startTime;
      demoSession.endTime = req.body.endTime || demoSession.endTime;
      demoSession.status = req.body.status || demoSession.status;
      demoSession.meetingLink = req.body.meetingLink !== undefined ? req.body.meetingLink : demoSession.meetingLink;
      demoSession.notes = req.body.notes !== undefined ? req.body.notes : demoSession.notes;
      demoSession.cancellationReason = req.body.cancellationReason !== undefined ? req.body.cancellationReason : demoSession.cancellationReason;

      // Recalculate conflict for this demo session
      if (demoSession.teacher) {
        const dateObj = new Date(demoSession.date);
        const scheduleConflict = await Schedule.findOne({
          teacher: demoSession.teacher,
          date: dateObj,
          status: { $ne: 'Cancelled' },
          $or: [
            { startTime: { $lt: demoSession.endTime }, endTime: { $gt: demoSession.startTime } },
          ],
        });

        const demoConflict = await DemoSession.findOne({
          _id: { $ne: demoSession._id },
          teacher: demoSession.teacher,
          date: dateObj,
          status: { $ne: 'Cancelled' },
          $or: [
            { startTime: { $lt: demoSession.endTime }, endTime: { $gt: demoSession.startTime } },
          ],
        });

        demoSession.conflict = !!scheduleConflict || !!demoConflict;
      } else {
        demoSession.conflict = false;
      }
    } else {
      // Teacher edits: allowed to change status, meetingLink, notes, cancellationReason, date, startTime, endTime
      if (req.body.status !== undefined) demoSession.status = req.body.status;
      if (req.body.date !== undefined) demoSession.date = new Date(req.body.date);
      if (req.body.startTime !== undefined) demoSession.startTime = req.body.startTime;
      if (req.body.endTime !== undefined) demoSession.endTime = req.body.endTime;
      if (req.body.meetingLink !== undefined) demoSession.meetingLink = req.body.meetingLink;
      if (req.body.notes !== undefined) demoSession.notes = req.body.notes;
      if (req.body.cancellationReason !== undefined) demoSession.cancellationReason = req.body.cancellationReason;

      // Recalculate conflict for this demo session
      if (demoSession.teacher) {
        const dateObj = new Date(demoSession.date);
        const scheduleConflict = await Schedule.findOne({
          teacher: demoSession.teacher,
          date: dateObj,
          status: { $ne: 'Cancelled' },
          $or: [
            { startTime: { $lt: demoSession.endTime }, endTime: { $gt: demoSession.startTime } },
          ],
        });

        const demoConflict = await DemoSession.findOne({
          _id: { $ne: demoSession._id },
          teacher: demoSession.teacher,
          date: dateObj,
          status: { $ne: 'Cancelled' },
          $or: [
            { startTime: { $lt: demoSession.endTime }, endTime: { $gt: demoSession.startTime } },
          ],
        });

        demoSession.conflict = !!scheduleConflict || !!demoConflict;
      } else {
        demoSession.conflict = false;
      }
    }

    const updated = await demoSession.save();

    // Check if admission was newly confirmed and transfer to batch module
    const isNowConfirmed = updated.admissionConfirmed === 'Yes' || updated.admissionConfirmed === 'Won';
    const wasConfirmed = previousAdmissionConfirmed === 'Yes' || previousAdmissionConfirmed === 'Won';
    if ((isAdmin || isOwnerSales) && isNowConfirmed && !wasConfirmed) {
      if (!updated.batchAssigned) {
        const studentQuery: any = { name: updated.studentName };
        if (updated.studentEmail && updated.studentEmail.trim()) {
          studentQuery.email = updated.studentEmail.trim();
        }
        const existingStudent = await Student.findOne(studentQuery);
        if (!existingStudent || !existingStudent.batch) {
          const count = await Batch.countDocuments();
          const serialNo = count + 1;
          const batchName = `${updated.studentName} 1:1 ${serialNo}`;

          const teacherId = updated.classAssignedTutor 
            || (updated.teacher && typeof updated.teacher === 'object' ? updated.teacher._id : updated.teacher)
            || undefined;

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

          await Student.create({
            name: updated.studentName,
            batch: newBatch._id,
            parentName: updated.customerName || '',
            mobileNumber: updated.phoneNumber || '',
            email: updated.studentEmail || '',
          });
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
      const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin' || req.user?.role === 'Sub Admin';
      const isOwnerSales = req.user?.role === 'Sales Person' &&
        (demoSession.createdBy === req.user?._id?.toString() || demoSession.salesExecutive === req.user?.name);

      if (!isAdmin && !isOwnerSales) {
        res.status(403).json({ message: 'Not authorized to delete this demo session' });
        return;
      }

      await DemoSession.deleteOne({ _id: demoSession._id });
      res.json({ message: 'Demo session removed' });
    } else {
      res.status(404).json({ message: 'Demo session not found' });
    }
  } catch (error: any) {
    console.error('Delete demo session error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};
