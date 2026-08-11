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
    
    // Pre-fetch all batches into a Map<name, id> for O(1) lookups
    const allBatches = await Batch.find({});
    const batchMap = new Map<string, string>();
    for (const b of allBatches) {
      if (b.name) batchMap.set(b.name, b._id.toString());
    }

    // Pre-fetch all existing student unique keys into a Set for O(1) duplicate checks
    const allStudents = await Student.find({}).select('name batch');
    const existingStudentKeys = new Set<string>();
    for (const s of allStudents) {
      const bId = s.batch?._id ? s.batch._id.toString() : s.batch?.toString();
      if (s.name && bId) {
        existingStudentKeys.add(`${bId}:${s.name}`);
      }
    }

    const newStudentsToInsert: any[] = [];
    const batchCountIncrements = new Map<string, number>();

    // Process each row in memory
    for (const row of data) {
      const studentName = row['Student Name'] || row['name'];
      const batchName = row['Batch'] || row['batch'];
      const parentName = row['Parent Name'] || row['parentName'];
      const mobileNumber = row['Mobile Number'] || row['mobileNumber'];

      if (!studentName || !batchName) {
        continue; // Skip invalid rows
      }

      // Find or create batch
      let batchId = batchMap.get(batchName);
      if (!batchId) {
        let batch = await Batch.create({
          name: batchName,
          subject: 'General',
          studentsCount: 0,
          status: 'Active',
          days: ['Monday'],
          timing: { startTime: '09:00', endTime: '10:00' },
        });
        batchId = String(batch._id);
        batchMap.set(batchName, batchId);
      }

      if (batchId) {
        const studentKey = `${batchId}:${studentName}`;
        if (!existingStudentKeys.has(studentKey)) {
          existingStudentKeys.add(studentKey);
          newStudentsToInsert.push({
            name: studentName,
            batch: batchId,
            parentName: parentName || '',
            mobileNumber: mobileNumber || '',
          });
          const curr = batchCountIncrements.get(batchId) || 0;
          batchCountIncrements.set(batchId, curr + 1);
        }
      }
    }

    if (newStudentsToInsert.length > 0) {
      await Student.insertMany(newStudentsToInsert);
      for (const [bId, inc] of batchCountIncrements.entries()) {
        await Batch.findByIdAndUpdate(bId, { $inc: { studentsCount: inc } });
      }
      createdStudents = newStudentsToInsert.length;
    }

    res.status(200).json({ message: `Successfully imported ${createdStudents} students and arranged batches.` });
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

export const createStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = studentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, batch, parentName, mobileNumber, whatsappNumber, email } = parsed.data;
    
    const existingStudent = await Student.findOne({ name, batch });
    if (existingStudent) {
      res.status(400).json({ message: 'Student already exists in this batch' });
      return;
    }

    const newStudent = await Student.create({
      name,
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
      student.pastBatches.push({
        batch: oldBatchId,
        leftAt: new Date(),
      });
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
