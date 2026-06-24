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
    const batchMap = new Map<string, any>();

    // Process each row
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
        let batch = await Batch.findOne({ name: batchName });
        if (!batch) {
          // Auto create batch if it doesn't exist
          batch = await Batch.create({
            name: batchName,
            subject: 'General', // Default subject
            studentsCount: 0,
            status: 'Active',
            days: ['Monday'], // Default
            timing: { startTime: '09:00', endTime: '10:00' },
          });
        }
        batchId = batch._id;
        batchMap.set(batchName, batchId);
      }

      // Check if student already exists in this batch to avoid duplicates
      const existingStudent = await Student.findOne({ name: studentName, batch: batchId });
      if (!existingStudent) {
        await Student.create({
          name: studentName,
          batch: batchId,
          parentName: parentName || '',
          mobileNumber: mobileNumber || '',
        });
        
        // Update batch count
        await Batch.findByIdAndUpdate(batchId, { $inc: { studentsCount: 1 } });
        createdStudents++;
      }
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
    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (!teacher) {
        res.status(200).json([]);
        return;
      }
      
      const teacherBatches = await Batch.find({ assignedTeacher: teacher._id }).select('_id');
      const teacherBatchIds = teacherBatches.map((b: any) => b._id);
      
      const students = await Student.find({
        $or: [
          { batch: { $in: teacherBatchIds } },
          { 'pastBatches.batch': { $in: teacherBatchIds } }
        ]
      }).populate('batch', 'name subject');
      
      res.status(200).json(students);
      return;
    }

    const students = await Student.find().populate('batch', 'name subject');
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all students' });
  }
};

export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string)
      .populate('batch', 'name subject')
      .populate('pastBatches.batch', 'name subject');
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
