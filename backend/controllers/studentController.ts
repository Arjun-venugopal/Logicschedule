import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { z } from 'zod';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Teacher from '../models/Teacher';

// Setup multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

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
    for (const b of allBatches) {
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

          // Advance / Move existing student to the new level/batch
          if (currBatchId) {
            if (!existingStudent.pastBatches) existingStudent.pastBatches = [];
            const alreadyInPast = existingStudent.pastBatches.some((pb: any) => {
              const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
              return pbId === currBatchId;
            });
            if (!alreadyInPast) {
              existingStudent.pastBatches.push({
                batch: currBatchId,
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

          await existingStudent.save();
          const curr = batchCountIncrements.get(batchId) || 0;
          batchCountIncrements.set(batchId, curr + 1);
          advancedStudents++;
        } else {
          // Check if queued in same batch in this Excel file to avoid duplicates
          const alreadyQueued = newStudentsToInsert.find((s) => s.batch === batchId && s.name.toLowerCase() === normName);
          if (!alreadyQueued) {
            const newDoc = {
              name: studentName,
              batch: batchId,
              parentName: parentName || '',
              mobileNumber: mobileNumber || '',
              email: email || '',
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
    const students = await Student.find({ batch: batchId });
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

      const students = await queryChain.populate('batch', 'name subject status');
      res.status(200).json(students);
      return;
    }

    let queryChain = Student.find();
    if (limit) queryChain = queryChain.limit(limit);
    if (startAfter) queryChain = queryChain.startAfter(startAfter);

    const students = await queryChain.populate('batch', 'name subject status');
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all students' });
  }
};

export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string)
      .populate('batch', 'name subject status')
      .populate('pastBatches.batch', 'name subject status');
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
    const { name, batch, parentName, mobileNumber, whatsappNumber, email } = parsed.data;
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
          existingStudent.pastBatches.push({
            batch: oldBatchId,
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

      const updatedStudent = await existingStudent.save();
      if (newBatchId) {
        await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
      }

      res.status(200).json(updatedStudent);
      return;
    }

    // 3. New child registration
    const newStudent = await Student.create({
      name: trimmedName,
      batch,
      parentName: parentName || '',
      mobileNumber: mobileNumber || '',
      whatsappNumber: whatsappNumber || '',
      email: email || '',
    });

    if (batch) {
      await Batch.findByIdAndUpdate(batch, { $inc: { studentsCount: 1 } });
    }

    res.status(201).json(newStudent);
  } catch (error: any) {
    next(error);
  }
};

export const updateStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = studentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, batch, parentName, mobileNumber, whatsappNumber, email } = parsed.data;
    const studentId = req.params.id as string;

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    // Handle batch change logic
    const oldBatchId = student.batch;
    const newBatchId = batch;

    if (oldBatchId && newBatchId && oldBatchId.toString() !== newBatchId.toString()) {
      // Add to pastBatches before changing
      if (!student.pastBatches) student.pastBatches = [];
      const alreadyInPast = student.pastBatches.some((pb: any) => {
        const pbId = pb.batch?._id ? pb.batch._id.toString() : pb.batch?.toString();
        return pbId === oldBatchId.toString();
      });
      if (!alreadyInPast) {
        student.pastBatches.push({
          batch: oldBatchId,
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

    const updatedStudent = await student.save();

    // If batch changed, update counts
    if (oldBatchId && newBatchId && oldBatchId.toString() !== newBatchId.toString()) {
      await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
    } else if (!oldBatchId && newBatchId) {
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
    }

    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update student' });
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
