import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as xlsx from 'xlsx';
import { z } from 'zod';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Teacher from '../models/Teacher';
import { AuthRequest } from '../middleware/authMiddleware';
import { serverCache, deleteDiskCache } from '../utils/cache';
import { generateSchedulesForBatch, normalizeDateOnlyToUtc } from './batchController';

export function extractLevel(text?: string, fallback = 'Level 1'): string {
  if (!text) return fallback;
  const match = text.match(/level\s*[-]?\s*(\d+)/i) || text.match(/lvl\s*[-]?\s*(\d+)/i);
  return match ? `Level ${match[1]}` : fallback;
}

export const uploadStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet) as any[];

    // Ensure we have some data
    if (!data || data.length === 0) {
      res.status(400).json({ message: 'Excel file is empty' });
      return;
    }

    let createdStudents = 0;
    let advancedStudents = 0;
    
    // Pre-fetch all batches into a Map<name, id> for O(1) lookups
    const allBatches = await Batch.find({});
    const batchMap = new Map<string, string>();
    const batchById = new Map<string, any>();
    for (const b of allBatches) {
      batchById.set(b._id.toString(), b);
      if (b.name) batchMap.set(b.name.trim().toLowerCase(), b._id.toString());
    }

    // Pre-fetch all existing students with full batch & contact details
    const allStudents = await Student.find({});
    const studentByName = new Map<string, any>();
    const studentByPhone = new Map<string, any>();
    const studentByEmail = new Map<string, any>();

    for (const s of allStudents) {
      if (s.name) {
        studentByName.set(s.name.trim().toLowerCase(), s);
      }
      if (s.mobileNumber) {
        const clean = String(s.mobileNumber).replace(/\D/g, '');
        if (clean.length >= 8) studentByPhone.set(clean.slice(-10), s);
      }
      if (s.email) {
        studentByEmail.set(String(s.email).trim().toLowerCase(), s);
      }
    }

    const newStudentsToInsert: any[] = [];
    const batchCountIncrements = new Map<string, number>();

    // Process each row in memory
    for (const row of data) {
      const rawName = row['Student Name'] || row['name'];
      const rawBatch = row['Batch'] || row['batch'];
      const parentName = row['Parent Name'] || row['parentName'];
      const mobileNumber = row['Mobile Number'] || row['mobileNumber'];
      const email = row['Email'] || row['email'];

      if (!rawName || !rawBatch) {
        continue; // Skip invalid rows
      }

      const studentName = String(rawName).trim();
      const batchName = String(rawBatch).trim();
      const normBatch = batchName.toLowerCase();

      // Find or create batch
      let batchId = batchMap.get(normBatch);
      if (!batchId) {
        let batch = await Batch.create({
          name: batchName,
          subject: batchName.includes('-') ? batchName.split('-')[0].trim() : 'General',
          studentsCount: 0,
          status: 'Active',
          days: ['Monday'],
          timing: { startTime: '09:00', endTime: '10:00' },
        });
        batchId = String(batch._id);
        batchMap.set(normBatch, batchId);
        batchById.set(batchId, batch);
      }

      if (batchId) {
        const normName = studentName.toLowerCase();
        const cleanPhone = String(mobileNumber || '').replace(/\D/g, '');
        const last10Phone = cleanPhone.length >= 8 ? cleanPhone.slice(-10) : '';
        const normEmail = String(email || '').trim().toLowerCase();

        const existingStudent = 
          (normEmail && studentByEmail.get(normEmail)) ||
          (last10Phone && studentByPhone.get(last10Phone)) ||
          studentByName.get(normName);

        if (existingStudent && existingStudent._id) {
          const currBatchId = existingStudent.batch?._id ? existingStudent.batch._id.toString() : existingStudent.batch?.toString();
          if (currBatchId === batchId) {
            // Already in this batch, do not duplicate
            continue;
          }

          // Advance / Move existing student to the new level/batch without duplicating student record
          if (currBatchId) {
            if (!existingStudent.pastBatches) existingStudent.pastBatches = [];
            const alreadyInPast = existingStudent.pastBatches.some((pb: any) => {
              const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
              return pbId === currBatchId;
            });
            if (!alreadyInPast) {
              const oldB = batchById.get(currBatchId);
              const prevLevelTag = existingStudent.currentLevel || existingStudent.level || extractLevel(oldB?.name, 'Level 1');
              existingStudent.pastBatches.push({
                batch: currBatchId,
                batchName: oldB?.name,
                batchSubject: oldB?.subject,
                level: prevLevelTag,
                teacher: oldB?.assignedTeacher?._id || oldB?.assignedTeacher,
                teacherName: oldB?.assignedTeacher?.name || '',
                numberOfClasses: oldB?.numberOfSessions || 0,
                status: 'Completed',
                leftAt: new Date(),
              });
            }
            await Batch.findByIdAndUpdate(currBatchId, { $inc: { studentsCount: -1 } });
          }

          existingStudent.batch = batchId;
          if (parentName) existingStudent.parentName = parentName;
          if (mobileNumber) existingStudent.mobileNumber = mobileNumber;
          if (email) existingStudent.email = email;
          existingStudent.name = studentName;

          const targetB = batchById.get(batchId);
          const nextLvlTag = extractLevel(targetB?.name, existingStudent.currentLevel || 'Level 2');
          existingStudent.currentLevel = nextLvlTag;
          existingStudent.level = nextLvlTag;

          await existingStudent.save();
          const curr = batchCountIncrements.get(batchId) || 0;
          batchCountIncrements.set(batchId, curr + 1);
          advancedStudents++;
        } else {
          // Check if queued in same batch in this Excel file to avoid duplicates
          const alreadyQueued = newStudentsToInsert.find((s) => s.batch === batchId && s.name.toLowerCase() === normName);
          if (!alreadyQueued) {
            const initialLvlTag = extractLevel(batchName, 'Level 1');
            const newDoc = {
              name: studentName,
              batch: batchId,
              parentName: parentName || '',
              mobileNumber: mobileNumber || '',
              email: email || '',
              currentLevel: initialLvlTag,
              level: initialLvlTag,
            };
            newStudentsToInsert.push(newDoc);
            studentByName.set(normName, newDoc);
            if (last10Phone) studentByPhone.set(last10Phone, newDoc);
            if (normEmail) studentByEmail.set(normEmail, newDoc);

            const curr = batchCountIncrements.get(batchId) || 0;
            batchCountIncrements.set(batchId, curr + 1);
          }
        }
      }
    }

    if (newStudentsToInsert.length > 0) {
      await Student.insertMany(newStudentsToInsert);
      createdStudents = newStudentsToInsert.length;
    }

    for (const [bId, inc] of batchCountIncrements.entries()) {
      if (inc > 0) {
        await Batch.findByIdAndUpdate(bId, { $inc: { studentsCount: inc } });
      }
    }

    res.status(200).json({ 
      message: `Successfully processed: ${createdStudents} new students added, ${advancedStudents} students moved to next level/batch.` 
    });
  } catch (error) {
    console.error('Error uploading students:', error);
    res.status(500).json({ message: 'Failed to process Excel file' });
  }
};

export const getStudentsByBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;
    const bId = (Array.isArray(batchId) ? batchId[0] : batchId) as string;
    const students = await Student.find({ batch: bId });
    
    // Also include any students referenced in batch.students
    const batch = await Batch.findById(bId);
    if (batch && Array.isArray(batch.students) && batch.students.length > 0) {
      const studentMap = new Map<string, any>();
      students.forEach((s: any) => {
        if (s?._id) studentMap.set(s._id.toString(), s);
      });

      const extraIds = batch.students
        .map((st: any) => (st?._id ? st._id.toString() : (typeof st === 'string' ? st : '')))
        .filter((id: string) => id && !studentMap.has(id));

      if (extraIds.length > 0) {
        const extraStudents = await Student.find({ _id: { $in: extraIds } });
        extraStudents.forEach((s: any) => {
          if (s?._id) studentMap.set(s._id.toString(), s);
        });
      }
      res.status(200).json(Array.from(studentMap.values()));
      return;
    }

    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch students' });
  }
};

export const getAllStudents = async (req: any, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const startAfter = req.query.startAfter as string | undefined;

    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (!teacher) {
        res.status(200).json([]);
        return;
      }
      
      const teacherBatches = await Batch.find({ assignedTeacher: teacher._id }).select('_id');
      const teacherBatchIds = teacherBatches.map((b: any) => b._id);
      
      let queryChain = Student.find({
        $or: [
          { batch: { $in: teacherBatchIds } },
          { 'pastBatches.batch': { $in: teacherBatchIds } }
        ]
      });
      if (limit) queryChain = queryChain.limit(limit);
      if (startAfter) queryChain = queryChain.startAfter(startAfter);

      const students = await queryChain
        .populate('batch', 'name subject status assignedTeacher numberOfSessions')
        .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
      res.status(200).json(students);
      return;
    }

    let queryChain = Student.find();
    if (limit) queryChain = queryChain.limit(limit);
    if (startAfter) queryChain = queryChain.startAfter(startAfter);

    const students = await queryChain
      .populate('batch', 'name subject status assignedTeacher numberOfSessions')
      .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all students' });
  }
};

export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string)
      .populate('batch', 'name subject status assignedTeacher numberOfSessions')
      .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch student' });
  }
};

const studentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  batch: z.string().min(1, "Batch is required"),
  parentName: z.string().optional(),
  mobileNumber: z.string().optional(),
  whatsappNumber: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  currentLevel: z.string().optional(),
  level: z.string().optional(),
  classesNeeded: z.union([z.number(), z.string()]).optional(),
  assignedTutor: z.string().optional(),
});

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function findExistingStudent(studentName: string, studentEmail?: string, phoneNumber?: string) {
  const cleanEmail = studentEmail ? String(studentEmail).trim().toLowerCase() : '';
  const cleanPhone = phoneNumber ? String(phoneNumber).replace(/\D/g, '') : '';
  const cleanName = studentName ? String(studentName).trim() : '';

  // 1. Try matching by email
  if (cleanEmail) {
    const byEmail = await Student.findOne({ email: cleanEmail });
    if (byEmail) return byEmail;
  }

  // 2. Try matching by phone
  if (cleanPhone && cleanPhone.length >= 8) {
    const allStudents = await Student.find({}).select('_id name mobileNumber email batch pastBatches');
    const last10 = cleanPhone.slice(-10);
    const byPhone = allStudents.find((s: any) => {
      const p = String(s.mobileNumber || '').replace(/\D/g, '');
      return p.length >= 8 && p.slice(-10) === last10;
    });
    if (byPhone) return Student.findById(byPhone._id);
  }

  // 3. Try matching by normalized name (case-insensitive & trimmed)
  if (cleanName) {
    const escaped = escapeRegex(cleanName);
    const byName = await Student.findOne({
      name: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' }
    });
    if (byName) return byName;
  }

  return null;
}

export const createStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = studentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, batch, parentName, mobileNumber, whatsappNumber, email, currentLevel, level, classesNeeded, assignedTutor } = parsed.data;
    const trimmedName = name.trim();
    
    // 1. Check if already enrolled in this exact batch
    const existingInBatch = await Student.findOne({
      name: { $regex: `^\\s*${escapeRegex(trimmedName)}\\s*$`, $options: 'i' },
      batch
    });
    if (existingInBatch) {
      res.status(400).json({ message: 'Student already exists in this batch' });
      return;
    }

    // 2. Check if student already exists in the system (e.g. moving from Level 1 to Level 2)
    const existingStudent = await findExistingStudent(trimmedName, email, mobileNumber);

    if (existingStudent) {
      // ADVANCE / MOVE existing child to the new batch/level without creating duplicate details
      const oldBatchId = existingStudent.batch?._id ? existingStudent.batch._id.toString() : existingStudent.batch?.toString();
      const newBatchId = batch;

      if (oldBatchId && oldBatchId !== newBatchId) {
        if (!existingStudent.pastBatches) existingStudent.pastBatches = [];
        const alreadyInPast = existingStudent.pastBatches.some((pb: any) => {
          const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
          return pbId === oldBatchId;
        });
        if (!alreadyInPast) {
          let oldBName = '';
          let oldBSub = '';
          let oldTeacherId: any = undefined;
          let oldTeacherName = '';
          let oldSessions = 0;
          try {
            const oldB = await Batch.findById(oldBatchId).populate('assignedTeacher', 'name email');
            if (oldB) {
              oldBName = oldB.name;
              oldBSub = oldB.subject;
              oldTeacherId = oldB.assignedTeacher?._id || oldB.assignedTeacher;
              oldTeacherName = oldB.assignedTeacher?.name || oldB.assignedTeacher?.user?.name || '';
              oldSessions = oldB.numberOfSessions || 0;
            }
          } catch {}

          const prevLevel = existingStudent.currentLevel || existingStudent.level || extractLevel(oldBName, 'Level 1');

          existingStudent.pastBatches.push({
            batch: oldBatchId,
            batchName: oldBName,
            batchSubject: oldBSub,
            level: prevLevel,
            teacher: oldTeacherId,
            teacherName: oldTeacherName || undefined,
            numberOfClasses: oldSessions,
            status: 'Completed',
            leftAt: new Date(),
          });
        }
        await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
      }

      existingStudent.batch = newBatchId;
      if (parentName) existingStudent.parentName = parentName;
      if (mobileNumber) existingStudent.mobileNumber = mobileNumber;
      if (whatsappNumber) existingStudent.whatsappNumber = whatsappNumber;
      if (email) existingStudent.email = email;
      if (trimmedName) existingStudent.name = trimmedName;

      let derivedLevel = currentLevel || level;
      if (!derivedLevel && newBatchId) {
        try {
          const newB = await Batch.findById(newBatchId);
          if (newB?.name) {
            derivedLevel = extractLevel(newB.name, undefined);
          }
        } catch {}
      }
      if (derivedLevel) {
        existingStudent.currentLevel = derivedLevel;
        existingStudent.level = derivedLevel;
      }
      if (classesNeeded !== undefined) existingStudent.classesNeeded = Number(classesNeeded);
      if (assignedTutor !== undefined) existingStudent.assignedTutor = assignedTutor;

      const updatedStudent = await existingStudent.save();
      if (newBatchId) {
        await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
      }

      serverCache.clearPattern('students_');
      serverCache.clearPattern('batches_');
      res.status(200).json(updatedStudent);
      return;
    }

    // 3. New child registration
    let initialLevel = currentLevel || level;
    if (!initialLevel && batch) {
      try {
        const batchDoc = await Batch.findById(batch);
        if (batchDoc?.name) {
          initialLevel = extractLevel(batchDoc.name, 'Level 1');
        }
      } catch {}
    }
    if (!initialLevel) initialLevel = 'Level 1';

    const newStudent = await Student.create({
      name: trimmedName,
      batch,
      parentName: parentName || '',
      mobileNumber: mobileNumber || '',
      whatsappNumber: whatsappNumber || '',
      email: email || '',
      currentLevel: initialLevel,
      level: initialLevel,
      classesNeeded: classesNeeded !== undefined ? Number(classesNeeded) : undefined,
      assignedTutor: assignedTutor || undefined,
    });

    if (batch) {
      await Batch.findByIdAndUpdate(batch, { $inc: { studentsCount: 1 } });
    }

    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');
    res.status(201).json(newStudent);
  } catch (error: any) {
    next(error);
  }
};

export const updateStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = studentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, batch, parentName, mobileNumber, whatsappNumber, email, currentLevel, level, classesNeeded, assignedTutor } = parsed.data;
    const studentId = req.params.id as string;

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    // Handle batch change logic
    const oldBatchId = student.batch?._id ? student.batch._id.toString() : (typeof student.batch === 'string' ? student.batch : student.batch?.toString());
    const newBatchId = batch ? batch.toString() : undefined;

    if (oldBatchId && newBatchId && oldBatchId !== newBatchId) {
      // Add to pastBatches before changing
      if (!student.pastBatches) student.pastBatches = [];
      const alreadyInPast = student.pastBatches.some((pb: any) => {
        const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
        return pbId === oldBatchId;
      });
      if (!alreadyInPast) {
        let oldBatchName = '';
        let oldBatchSubject = '';
        let oldTeacherId: any = undefined;
        let oldTeacherName = '';
        let oldSessions = 0;
        try {
          const oldBatchDoc = await Batch.findById(oldBatchId).populate('assignedTeacher', 'name email');
          if (oldBatchDoc) {
            oldBatchName = oldBatchDoc.name;
            oldBatchSubject = oldBatchDoc.subject;
            oldTeacherId = oldBatchDoc.assignedTeacher?._id || oldBatchDoc.assignedTeacher;
            oldTeacherName = oldBatchDoc.assignedTeacher?.name || oldBatchDoc.assignedTeacher?.user?.name || '';
            oldSessions = oldBatchDoc.numberOfSessions || 0;
          }
        } catch (e) {
          console.warn('Failed to fetch old batch info for snapshot:', e);
        }

        const prevLevel = student.currentLevel || student.level || extractLevel(oldBatchName, 'Level 1');

        student.pastBatches.push({
          batch: oldBatchId,
          batchName: oldBatchName || (typeof student.batch === 'object' ? student.batch.name : undefined),
          batchSubject: oldBatchSubject || (typeof student.batch === 'object' ? student.batch.subject : undefined),
          level: prevLevel,
          teacher: oldTeacherId,
          teacherName: oldTeacherName || undefined,
          numberOfClasses: oldSessions,
          status: 'Completed',
          leftAt: new Date(),
        });
      }
    }

    if (name !== undefined) student.name = name;
    if (batch !== undefined) student.batch = batch;
    if (parentName !== undefined) student.parentName = parentName;
    if (mobileNumber !== undefined) student.mobileNumber = mobileNumber;
    if (whatsappNumber !== undefined) student.whatsappNumber = whatsappNumber;
    if (email !== undefined) student.email = email;
    if (currentLevel !== undefined) {
      student.currentLevel = currentLevel;
      student.level = currentLevel;
    } else if (level !== undefined) {
      student.currentLevel = level;
      student.level = level;
    }
    if (classesNeeded !== undefined) student.classesNeeded = Number(classesNeeded);
    if (assignedTutor !== undefined) student.assignedTutor = assignedTutor;

    await student.save();

    // If batch changed, update counts
    if (oldBatchId && newBatchId && oldBatchId !== newBatchId) {
      await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
    } else if (!oldBatchId && newBatchId) {
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
    }

    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');

    await student.populate('batch', 'name subject status assignedTeacher numberOfSessions');
    await student.populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');

    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update student' });
  }
};

export const advanceStudentLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    const {
      batchId,
      batchName,
      subject,
      level,
      numberOfClasses,
      teacherId,
      timing,
      days,
      meetingLink,
      startDate,
    } = req.body;

    const oldBatchId = student.batch?._id 
      ? student.batch._id.toString() 
      : (typeof student.batch === 'string' ? student.batch : student.batch?.toString());

    let oldBatchDoc: any = null;
    let oldTeacherName = '';
    let oldTeacherId: any = undefined;
    let oldSessions = 0;

    // 1. Snapshot previous batch and level into pastBatches (Academic History)
    if (oldBatchId) {
      if (!student.pastBatches) student.pastBatches = [];
      const alreadyInPast = student.pastBatches.some((pb: any) => {
        const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
        return pbId === oldBatchId;
      });

      try {
        oldBatchDoc = await Batch.findById(oldBatchId).populate('assignedTeacher', 'name email');
        if (oldBatchDoc) {
          oldTeacherId = oldBatchDoc.assignedTeacher?._id || oldBatchDoc.assignedTeacher;
          oldTeacherName = oldBatchDoc.assignedTeacher?.name || 
                           oldBatchDoc.assignedTeacher?.user?.name || 
                           (typeof oldBatchDoc.assignedTeacher === 'string' ? oldBatchDoc.assignedTeacher : '');
          oldSessions = oldBatchDoc.numberOfSessions || 0;
        }
      } catch (e) {
        console.warn('Could not populate old batch details:', e);
      }

      if (!alreadyInPast) {
        const prevLevelTag = student.currentLevel || 
          student.level || 
          extractLevel(oldBatchDoc?.name, 'Level 1');

        student.pastBatches.push({
          batch: oldBatchId,
          batchName: oldBatchDoc?.name || (typeof student.batch === 'object' ? student.batch.name : `${student.name} - ${prevLevelTag}`),
          batchSubject: oldBatchDoc?.subject || (typeof student.batch === 'object' ? student.batch.subject : 'General'),
          level: prevLevelTag,
          teacher: oldTeacherId || student.assignedTutor,
          teacherName: oldTeacherName || undefined,
          numberOfClasses: oldSessions || student.classesNeeded || 15,
          status: 'Completed',
          leftAt: new Date(),
        });
      }

      // Mark old batch as completed if it was a dedicated 1:1 batch (studentsCount <= 1)
      if (oldBatchDoc && (!oldBatchDoc.studentsCount || oldBatchDoc.studentsCount <= 1)) {
        oldBatchDoc.status = 'Completed';
        await oldBatchDoc.save();
      } else if (oldBatchDoc) {
        try {
          await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
        } catch (err) {
          console.warn('Failed to decrement old batch student count:', err);
        }
      }
    }

    // 2. Next Level Progression Tag
    const finalLevelTag = level || `Level ${(student.pastBatches?.length || 0) + 1}`;
    const targetSessions = numberOfClasses && Number(numberOfClasses) > 0 ? Number(numberOfClasses) : (oldSessions || 15);

    // 3. Resolve or create new next level batch for this student (No separate batch selection needed!)
    let targetBatchId: string;
    let targetBatchDoc: any = null;

    if (batchId) {
      // Optional fallback if existing batch was explicitly provided
      targetBatchDoc = await Batch.findById(batchId);
      if (targetBatchDoc) {
        let changed = false;
        if (teacherId && targetBatchDoc.assignedTeacher?.toString() !== teacherId.toString()) {
          targetBatchDoc.assignedTeacher = teacherId;
          changed = true;
        }
        if (targetSessions > 0 && targetBatchDoc.numberOfSessions !== targetSessions) {
          targetBatchDoc.numberOfSessions = targetSessions;
          changed = true;
        }
        if (changed) {
          await targetBatchDoc.save();
        }
      }
      targetBatchId = batchId;
    } else {
      // Standard flow: Automatically create next level batch for the same student
      const studentName = student.name ? student.name.trim() : 'Student';
      const newBatchName = batchName && batchName.trim() ? batchName.trim() : `${studentName} - ${finalLevelTag}`;
      const batchSubject = subject || oldBatchDoc?.subject || 'General';
      const targetTeacherId = teacherId || oldTeacherId || student.assignedTutor || undefined;
      const targetDays = (days && Array.isArray(days) && days.length > 0) 
        ? days 
        : (oldBatchDoc?.days?.length ? oldBatchDoc.days : ['Monday', 'Wednesday', 'Friday']);
      const targetTiming = (timing && timing.startTime && timing.endTime) 
        ? timing 
        : (oldBatchDoc?.timing?.startTime ? oldBatchDoc.timing : { startTime: '09:00', endTime: '10:00' });
      const targetMeetingLink = meetingLink !== undefined 
        ? meetingLink 
        : (oldBatchDoc?.meetingLink || '');
      const targetStartDate = startDate ? (normalizeDateOnlyToUtc(startDate) || new Date()) : new Date();

      targetBatchDoc = await Batch.create({
        name: newBatchName,
        subject: batchSubject,
        assignedTeacher: targetTeacherId,
        numberOfSessions: targetSessions,
        studentsCount: 1,
        status: 'Active',
        days: targetDays,
        timing: targetTiming,
        meetingLink: targetMeetingLink,
        startDate: targetStartDate,
        durationType: 'Custom',
        preCompletedClasses: 0,
      });

      targetBatchId = targetBatchDoc._id.toString();

      // Auto-generate schedules for the new next level batch
      try {
        await generateSchedulesForBatch(targetBatchDoc, 0, studentId);
      } catch (schedErr: any) {
        console.warn('Failed to auto-generate schedules for next level batch:', schedErr?.message);
      }
    }

    // 4. Update existing student in-place (ZERO DUPLICATION)
    student.batch = targetBatchId;
    student.currentLevel = finalLevelTag;
    student.level = finalLevelTag;
    student.classesNeeded = targetSessions;
    if (teacherId || targetBatchDoc?.assignedTeacher) {
      student.assignedTutor = teacherId || targetBatchDoc.assignedTeacher;
    }

    await student.save();

    // Increment count on target batch only if target batch is different from old batch and was existing
    if (batchId && oldBatchId !== targetBatchId) {
      try {
        await Batch.findByIdAndUpdate(targetBatchId, { $inc: { studentsCount: 1 } });
      } catch (err) {
        console.warn('Failed to increment new batch student count:', err);
      }
    }

    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('schedules_');
    serverCache.clearPattern('stats_');
    deleteDiskCache('schedules_all');

    const updated = await Student.findById(studentId)
      .populate('batch', 'name subject status assignedTeacher numberOfSessions timing days meetingLink')
      .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');

    res.status(200).json(updated);
  } catch (error: any) {
    console.error('Error advancing student level:', error);
    res.status(500).json({ message: 'Failed to advance student to next level', detail: error.message });
  }
};

export const deleteStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    if (student.batch) {
      await Batch.findByIdAndUpdate(student.batch, { $inc: { studentsCount: -1 } });
    }

    await student.deleteOne();
    res.status(200).json({ message: 'Student removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete student' });
  }
};

export const submitProjectSubmission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const {
      milestone,
      batchId,
      batchName,
      courseName,
      projectTitle,
      projectLink,
      submissionDate,
      teacherRemarks,
      status,
    } = req.body;

    const mNum = Number(milestone);
    if (!mNum || mNum <= 0 || mNum % 5 !== 0) {
      res.status(400).json({ message: 'Milestone must be a positive multiple of 5 (e.g. 5, 10, 15, ...)' });
      return;
    }

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    const existingList: any[] = Array.isArray(student.projectSubmissions) ? [...student.projectSubmissions] : [];

    const targetBatchId = batchId
      ? batchId.toString()
      : (student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : ''));

    const existingIndex = existingList.findIndex((ps: any) => {
      const psBatchId = ps.batchId ? ps.batchId.toString() : '';
      return Number(ps.milestone) === mNum && (!targetBatchId || !psBatchId || psBatchId === targetBatchId);
    });

    const teacherName = req.user?.name || (existingIndex >= 0 ? existingList[existingIndex].teacherName : 'Assigned Teacher');
    const teacherId = req.user?._id ? req.user._id.toString() : undefined;
    const subDate = submissionDate || new Date().toISOString().split('T')[0];

    const hasLink = Boolean(projectLink && String(projectLink).trim());
    let newStatus = status;
    if (!newStatus) {
      newStatus = hasLink ? 'Link Submitted' : 'Pending';
    }

    const submissionEntry = {
      id: existingIndex >= 0 && existingList[existingIndex].id ? existingList[existingIndex].id : crypto.randomUUID(),
      milestone: mNum,
      batchId: targetBatchId,
      batchName: batchName || (typeof student.batch === 'object' ? student.batch?.name : undefined) || (existingIndex >= 0 ? existingList[existingIndex].batchName : undefined),
      courseName: courseName || (typeof student.batch === 'object' ? student.batch?.subject : undefined) || (existingIndex >= 0 ? existingList[existingIndex].courseName : undefined),
      projectTitle: projectTitle !== undefined ? String(projectTitle).trim() : (existingIndex >= 0 ? existingList[existingIndex].projectTitle : ''),
      projectLink: projectLink !== undefined ? String(projectLink).trim() : (existingIndex >= 0 ? existingList[existingIndex].projectLink : ''),
      submissionDate: subDate,
      teacherRemarks: teacherRemarks !== undefined ? String(teacherRemarks).trim() : (existingIndex >= 0 ? existingList[existingIndex].teacherRemarks : ''),
      teacherName: teacherName,
      teacherId: teacherId || (existingIndex >= 0 ? existingList[existingIndex].teacherId : undefined),
      status: newStatus,
      updatedAt: new Date().toISOString(),
      submittedAt: existingIndex >= 0 && existingList[existingIndex].submittedAt ? existingList[existingIndex].submittedAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      existingList[existingIndex] = {
        ...existingList[existingIndex],
        ...submissionEntry,
      };
    } else {
      existingList.push(submissionEntry);
    }

    // Sort by milestone ascending
    existingList.sort((a, b) => Number(a.milestone) - Number(b.milestone));

    student.projectSubmissions = existingList;
    await student.save();

    serverCache.clearPattern('students_');
    serverCache.delete(`auth_user_${studentId}`);
    deleteDiskCache('students_all');

    res.status(200).json({
      message: 'Project submission saved successfully',
      projectSubmissions: existingList,
      student,
    });
  } catch (error: any) {
    console.error('Error saving project submission:', error);
    res.status(500).json({ message: 'Failed to save project submission', detail: error.message });
  }
};

export const deleteProjectSubmission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const { milestone, batchId } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    if (Array.isArray(student.projectSubmissions)) {
      student.projectSubmissions = student.projectSubmissions.filter((ps: any) => {
        if (Number(ps.milestone) !== Number(milestone)) return true;
        if (batchId && ps.batchId && ps.batchId.toString() !== batchId.toString()) return true;
        return false;
      });
      await student.save();
      serverCache.clearPattern('students_');
      deleteDiskCache('students_all');
    }

    res.status(200).json({
      message: 'Project submission reset successfully',
      projectSubmissions: student.projectSubmissions || [],
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete project submission', detail: error.message });
  }
};

