import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as xlsx from 'xlsx';
import { z } from 'zod';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Teacher from '../models/Teacher';
import Payment from '../models/Payment';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import { calculateDueAfterClasses, calculatePaymentStatus } from '../utils/paymentRules';
import { AuthRequest } from '../middleware/authMiddleware';
import { serverCache, deleteDiskCache } from '../utils/cache';
import { generateSchedulesForBatch, generateRestartedSchedulesForBatch, normalizeDateOnlyToUtc, computeEndTime, getSlotTimingForDay, DAY_INDEX } from './batchController';
import { getKolkataNow, checkTeacherConflict, checkIntervalConflict } from '../utils/scheduleHelper';
import RecycleBin from '../models/RecycleBin';

export function extractLevel(text?: string, fallback = 'Level 1'): string {
  if (!text) return fallback;
  const match = text.match(/level\s*[-]?\s*(\d+)/i) || text.match(/lvl\s*[-]?\s*(\d+)/i);
  return match ? `Level ${match[1]}` : fallback;
}

export function extractLevelNumber(text?: string): number | null {
  if (!text) return null;
  const match = text.match(/level\s*[-]?\s*(\d+)/i) || text.match(/lvl\s*[-]?\s*(\d+)/i);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return isNaN(parsed) ? null : parsed;
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
    let students = await Student.find({ batch: bId });

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
      students = Array.from(studentMap.values());
    }

    const includeDropped = req.query.includeDropped === 'true';
    if (!includeDropped) {
      students = students.filter((s: any) => s.status !== 'Dropped');
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

    const cacheKey = `students_${req.user && req.user.role === 'Teacher' ? req.user._id : 'admin'}_${limit || 'all'}_${startAfter || 'start'}`;
    const cached = serverCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

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
          { 'pastBatches.batch': { $in: teacherBatchIds } },
          { assignedTutor: teacher._id }
        ]
      });
      if (limit) queryChain = queryChain.limit(limit);
      if (startAfter) queryChain = queryChain.startAfter(startAfter);

      const students = await queryChain
        .populate('batch', 'name subject status assignedTeacher numberOfSessions')
        .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions')
        .populate('assignedTutor', 'name email');
      serverCache.set(cacheKey, students, 30_000);
      res.status(200).json(students);
      return;
    }

    let queryChain = Student.find();
    if (limit) queryChain = queryChain.limit(limit);
    if (startAfter) queryChain = queryChain.startAfter(startAfter);

    const students = await queryChain
      .populate('batch', 'name subject status assignedTeacher numberOfSessions')
      .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions')
      .populate('assignedTutor', 'name email');
    serverCache.set(cacheKey, students, 30_000);
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all students' });
  }
};

export const STUDENT_BATCH_POPULATE_FIELDS =
  'name subject status assignedTeacher numberOfSessions timing dayTimings timeMode days durationMinutes startDate meetingLink studentsCount preCompletedClasses preRestartCompletedClasses isRestarted lastRestartDate restartedFromBatch isRetention';

export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string)
      .populate('batch', STUDENT_BATCH_POPULATE_FIELDS)
      .populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions')
      .populate('assignedTutor', 'name email');
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
  status: z.enum(['Active', 'Dropped', 'Completed', 'Inactive']).optional().or(z.string().optional()),
});

export const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function syncStudentBatchSchedules(
  studentId: string,
  newBatchId?: string,
  oldBatchId?: string
): Promise<void> {
  // 1. If moved from an old batch, remove student from Scheduled classes of that old batch
  if (oldBatchId && oldBatchId !== newBatchId) {
    try {
      const oldFutureSchedules = await Schedule.find({
        batch: oldBatchId,
        status: 'Scheduled',
      });
      for (const os of oldFutureSchedules) {
        if (Array.isArray(os.attendance)) {
          const filtered = os.attendance.filter(
            (a: any) => (a.studentId?._id || a.studentId || '').toString() !== studentId
          );
          if (filtered.length !== os.attendance.length) {
            os.attendance = filtered;
            await os.save();
          }
        }
      }
    } catch (err: any) {
      console.warn('Failed to remove student from old batch future schedules:', err?.message);
    }
  }

  // 2. If assigned to a new batch, ensure student and batch schedules are synchronized
  if (newBatchId) {
    try {
      const [batchDoc, studentDoc] = await Promise.all([
        Batch.findById(newBatchId),
        Student.findById(studentId),
      ]);

      if (batchDoc) {
        if (
          ['Paused', 'Dropped', 'Cancelled', 'Archived'].includes(batchDoc.status) ||
          studentDoc?.status === 'Paused' ||
          studentDoc?.status === 'Dropped'
        ) {
          return;
        }

        // Automatically assign batch teacher to student if student tutor is missing or needs sync
        const batchTeacherId = batchDoc.assignedTeacher?._id
          ? batchDoc.assignedTeacher._id.toString()
          : (batchDoc.assignedTeacher ? batchDoc.assignedTeacher.toString() : '');

        if (studentDoc && batchTeacherId) {
          const currentTutorId = studentDoc.assignedTutor?._id
            ? studentDoc.assignedTutor._id.toString()
            : (studentDoc.assignedTutor ? studentDoc.assignedTutor.toString() : '');
          if (currentTutorId !== batchTeacherId) {
            studentDoc.assignedTutor = batchTeacherId;
            await studentDoc.save();
          }
        }

        const existingSchedules = await Schedule.find({ batch: batchDoc._id });
        const activeExistingSchedules = existingSchedules.filter((s: any) => !s.isArchived && s.status !== 'Archived' && s.status !== 'Paused');
        const scheduledClasses = activeExistingSchedules.filter((s: any) => s.status === 'Scheduled');

        const hasTiming =
          (batchDoc.timing?.startTime && batchDoc.timing?.endTime) ||
          (batchDoc.dayTimings && typeof batchDoc.dayTimings === 'object' && Object.keys(batchDoc.dayTimings).length > 0) ||
          batchDoc.timing?.startTime;

        const targetSessions = (studentDoc?.classesNeeded && Number(studentDoc.classesNeeded) > 0)
          ? Number(studentDoc.classesNeeded)
          : (batchDoc.numberOfSessions && Number(batchDoc.numberOfSessions) > 0 ? Number(batchDoc.numberOfSessions) : 0);

        const isRestartedBatch = Boolean(
          batchDoc.isRestarted || batchDoc.restartedFromBatch || batchDoc.lastRestartDate
        );

        if (scheduledClasses.length === 0 && batchDoc.startDate && batchDoc.days?.length && hasTiming) {
          // No scheduled classes yet, auto-generate calendar starting from batch.startDate
          if (isRestartedBatch) {
            const totalS = targetSessions > 0 ? targetSessions : 15;
            const completedS = Math.max(
              Number(batchDoc.preCompletedClasses) || 0,
              existingSchedules.filter((s: any) => s.status === 'Completed').length
            );
            await generateRestartedSchedulesForBatch({
              batch: batchDoc,
              restartDateUtc: normalizeDateOnlyToUtc(batchDoc.lastRestartDate || batchDoc.startDate) || new Date(),
              completedCount: completedS,
              totalSessions: totalS,
              studentId,
            });
          } else {
            await generateSchedulesForBatch(batchDoc, batchDoc.preCompletedClasses || 0, studentId, targetSessions);
          }
        } else {
          // Schedules already exist:
          // A) Ensure student is added to attendance for all Scheduled classes
          for (const sched of scheduledClasses) {
            let modified = false;
            const att = Array.isArray(sched.attendance) ? [...sched.attendance] : [];
            const exists = att.some(
              (a: any) => (a.studentId?._id || a.studentId || '').toString() === studentId
            );
            if (!exists) {
              att.push({ studentId, isPresent: false, date: sched.date });
              sched.attendance = att;
              modified = true;
            }

            // Ensure scheduled class teacher matches batch assigned teacher
            if (batchTeacherId) {
              const schedTeacherId = sched.teacher?._id
                ? sched.teacher._id.toString()
                : (sched.teacher ? sched.teacher.toString() : '');
              if (schedTeacherId !== batchTeacherId) {
                sched.teacher = batchTeacherId;
                modified = true;
              }
            }

            if (modified) {
              await sched.save();
            }
          }

          // B) If student needs more sessions than existing classes, generate the remaining sessions!
          const existingCompletedCount = existingSchedules.filter((s: any) => s.status === 'Completed').length;
          const totalExisting = existingCompletedCount + scheduledClasses.length;
          if (targetSessions > 0 && totalExisting < targetSessions && batchDoc.startDate && batchDoc.days?.length && hasTiming) {
            if (isRestartedBatch) {
              const completedS = Math.max(
                Number(batchDoc.preCompletedClasses) || 0,
                existingCompletedCount
              );
              await generateRestartedSchedulesForBatch({
                batch: batchDoc,
                restartDateUtc: normalizeDateOnlyToUtc(batchDoc.lastRestartDate || batchDoc.startDate) || new Date(),
                completedCount: completedS,
                totalSessions: targetSessions,
                studentId,
              });
            } else {
              await generateSchedulesForBatch(batchDoc, batchDoc.preCompletedClasses || 0, studentId, targetSessions);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Failed to sync student to new batch schedules:', err?.message);
    }
  }

  serverCache.clearPattern('schedules_');
  serverCache.clearPattern('students_');
  serverCache.clearPattern('batches_');
  serverCache.clearPattern('stats_');
  serverCache.delete('teachers_all');
  deleteDiskCache('schedules_all');
}

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
    const { name, batch, parentName, mobileNumber, whatsappNumber, email, currentLevel, level, classesNeeded, assignedTutor, status } = parsed.data;
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
          } catch { }

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
        } catch { }
      }
      if (derivedLevel) {
        existingStudent.currentLevel = derivedLevel;
        existingStudent.level = derivedLevel;
      }
      if (classesNeeded !== undefined) existingStudent.classesNeeded = Number(classesNeeded);
      if (assignedTutor !== undefined) {
        existingStudent.assignedTutor = assignedTutor;
      } else if (newBatchId) {
        try {
          const bDoc = await Batch.findById(newBatchId);
          if (bDoc?.assignedTeacher) existingStudent.assignedTutor = bDoc.assignedTeacher;
        } catch { }
      }

      const updatedStudent = await existingStudent.save();
      if (newBatchId) {
        const finalLvlNum = extractLevelNumber(updatedStudent.currentLevel || updatedStudent.level);
        if (finalLvlNum !== null && finalLvlNum >= 2) {
          await Batch.findByIdAndUpdate(newBatchId, {
            $inc: { studentsCount: 1 },
            $set: { isRetention: true, retentionLevel: `Level ${finalLvlNum}` },
          });
        } else {
          await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
        }
      }

      await syncStudentBatchSchedules(updatedStudent._id.toString(), newBatchId, oldBatchId);
      serverCache.clearPattern('students_');
      serverCache.clearPattern('batches_');
      res.status(200).json(updatedStudent);
      return;
    }

    // 3. New child registration
    let initialLevel = currentLevel || level;
    let batchAssignedTeacher: any = undefined;
    let batchDoc: any = null;
    if (batch) {
      try {
        batchDoc = await Batch.findById(batch);
        if (batchDoc) {
          if (!initialLevel) {
            const batchLvlNum = extractLevelNumber(batchDoc.retentionLevel || batchDoc.name || batchDoc.subject);
            initialLevel = batchLvlNum ? `Level ${batchLvlNum}` : 'Level 1';
          }
          if (batchDoc.assignedTeacher) {
            batchAssignedTeacher = batchDoc.assignedTeacher;
          }
        }
      } catch { }
    }
    if (!initialLevel) initialLevel = 'Level 1';

    const finalTutor = assignedTutor || batchAssignedTeacher || undefined;

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
      assignedTutor: finalTutor,
      status: req.body.status || 'Active',
    });

    if (batch) {
      const initialLvlNum = extractLevelNumber(initialLevel);
      if (initialLvlNum !== null && initialLvlNum >= 2 && extractLevelNumber(batchDoc?.name) !== 1) {
        await Batch.findByIdAndUpdate(batch, {
          $inc: { studentsCount: 1 },
          $set: { isRetention: true, retentionLevel: `Level ${initialLvlNum}` },
        });
      } else {
        await Batch.findByIdAndUpdate(batch, { $inc: { studentsCount: 1 } });
      }
      await syncStudentBatchSchedules(newStudent._id.toString(), batch);
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
    const { name, batch, parentName, mobileNumber, whatsappNumber, email, currentLevel, level, classesNeeded, assignedTutor, status } = parsed.data;
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
    const oldStatus = student.status || 'Active';
    const newStatus = status !== undefined ? status : oldStatus;
    const statusChanged = status !== undefined && newStatus !== oldStatus;
    if (status !== undefined) {
      student.status = newStatus;
    }

    const targetBatchId = newBatchId || oldBatchId || (student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : ''));
    let targetBatchDoc: any = null;
    if (targetBatchId) {
      try {
        targetBatchDoc = await Batch.findById(targetBatchId);
      } catch { }
    }

    if (newBatchId && newBatchId !== oldBatchId && currentLevel === undefined && level === undefined && targetBatchDoc) {
      const targetBatchLvl = extractLevelNumber(targetBatchDoc.retentionLevel || targetBatchDoc.name || targetBatchDoc.subject);
      if (targetBatchLvl !== null && targetBatchLvl >= 2) {
        const nextTag = `Level ${targetBatchLvl}`;
        student.currentLevel = nextTag;
        student.level = nextTag;
      }
    }

    if (targetBatchDoc) {
      const finalStudentLvl = extractLevelNumber(student.currentLevel || student.level);
      const targetBatchLvl = extractLevelNumber(targetBatchDoc.retentionLevel || targetBatchDoc.name || targetBatchDoc.subject);
      if (targetBatchLvl === 1) {
        if (targetBatchDoc.isRetention) {
          targetBatchDoc.isRetention = false;
          await targetBatchDoc.save();
        }
      } else if (finalStudentLvl !== null && finalStudentLvl >= 2) {
        if (!targetBatchDoc.isRetention || !targetBatchDoc.retentionLevel) {
          targetBatchDoc.isRetention = true;
          targetBatchDoc.retentionLevel = `Level ${finalStudentLvl}`;
          await targetBatchDoc.save();
        }
      }
    }

    const currentTutorId = student.assignedTutor?._id
      ? student.assignedTutor._id.toString()
      : (student.assignedTutor ? student.assignedTutor.toString() : '');
    const currentBatchTeacherId = targetBatchDoc?.assignedTeacher?._id
      ? targetBatchDoc.assignedTeacher._id.toString()
      : (targetBatchDoc?.assignedTeacher ? targetBatchDoc.assignedTeacher.toString() : '');
    const effectiveOldTutorId = currentTutorId || currentBatchTeacherId;

    let newTutorId = effectiveOldTutorId;
    if (assignedTutor !== undefined) {
      newTutorId = assignedTutor ? ((assignedTutor as any)._id ? (assignedTutor as any)._id.toString() : String(assignedTutor)) : '';
      student.assignedTutor = newTutorId || undefined;
    } else if (newBatchId && (!student.assignedTutor || newBatchId !== oldBatchId)) {
      if (targetBatchDoc?.assignedTeacher) {
        newTutorId = currentBatchTeacherId;
        student.assignedTutor = newTutorId || undefined;
      }
    }

    const isTeacherTransfer = Boolean(
      newTutorId && (
        newTutorId !== currentTutorId ||
        (targetBatchDoc && newTutorId !== currentBatchTeacherId) ||
        (assignedTutor !== undefined && assignedTutor !== currentTutorId)
      )
    );

    // If assigned teacher changed or transferred, synchronize student profile, batch, and all upcoming schedules
    if (isTeacherTransfer && newTutorId) {
      try {
        let oldTeacherName = '';
        if (effectiveOldTutorId) {
          const oldTDoc = await Teacher.findById(effectiveOldTutorId).populate('user', 'name');
          oldTeacherName = oldTDoc?.name || (oldTDoc as any)?.user?.name || '';
        }
        let newTeacherName = '';
        const newTDoc = await Teacher.findById(newTutorId).populate('user', 'name');
        newTeacherName = newTDoc?.name || (newTDoc as any)?.user?.name || 'Teacher';

        // 1. Maintain accurate record of teacher changes in student.teacherHistory
        if (effectiveOldTutorId !== newTutorId) {
          if (!student.teacherHistory || !Array.isArray(student.teacherHistory)) {
            student.teacherHistory = [];
          }
          student.teacherHistory.push({
            teacher: newTutorId,
            teacherName: newTeacherName,
            previousTeacher: effectiveOldTutorId || undefined,
            previousTeacherName: oldTeacherName || undefined,
            changedAt: new Date(),
            changedBy: (req as any).user?._id || undefined,
            reason: req.body.reassignReason || 'Teacher reassigned by admin',
          });
        }

        // 2. Transfer all upcoming and pending classes to the new teacher while preserving completed classes
        if (targetBatchId) {
          const allStudentSchedules = await Schedule.find({ batch: targetBatchId });
          for (const s of allStudentSchedules) {
            if (s.status === 'Completed') {
              // Strictly preserve historical teacher assignments on completed classes
              let mod = false;
              if (!s.completedBy) {
                s.completedBy = s.replacementTeacher || s.teacher || effectiveOldTutorId;
                mod = true;
              }
              if (!s.completedByName) {
                s.completedByName = oldTeacherName || s.teacher?.name || 'Teacher';
                mod = true;
              }
              if (mod) await s.save();
            } else if (s.status === 'Scheduled') {
              // Assign upcoming/pending classes to new teacher
              if (s.teacher?.toString() !== newTutorId) {
                s.teacher = newTutorId;
                if (s.replacementTeacher?.toString() === effectiveOldTutorId) {
                  s.replacementTeacher = undefined;
                }
                await s.save();
              }
            }
          }
        }

        // 3. Update target batch assignedTeacher if it's a 1:1 batch or assigned to old teacher
        if (targetBatchDoc) {
          const isSingleStudentBatch =
            (targetBatchDoc.name && targetBatchDoc.name.includes('1:1')) ||
            (targetBatchDoc.studentsCount !== undefined && Number(targetBatchDoc.studentsCount) <= 1) ||
            !currentBatchTeacherId ||
            currentBatchTeacherId === effectiveOldTutorId;

          if (isSingleStudentBatch && currentBatchTeacherId !== newTutorId) {
            targetBatchDoc.assignedTeacher = newTutorId;
            await targetBatchDoc.save();
          }
        }

        // 4. Invalidate caches immediately across all layers
        serverCache.clearPattern('schedules_');
        serverCache.clearPattern('students_');
        serverCache.clearPattern('batches_');
        serverCache.clearPattern('stats_');
        serverCache.clearPattern('timings_');
        serverCache.delete('teachers_all');
        deleteDiskCache('schedules_all');
        if (effectiveOldTutorId) deleteDiskCache(`schedules_teacher_${effectiveOldTutorId}`);
        if (newTutorId) deleteDiskCache(`schedules_teacher_${newTutorId}`);
      } catch (reassignErr: any) {
        console.warn('Error during teacher reassignment transfer:', reassignErr?.message);
      }
    }

    await student.save();
    if (statusChanged) {
      const targetBatchId = newBatchId || oldBatchId || (student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : ''));

      if (newStatus === 'Dropped') {
        if (targetBatchId) {
          const upcomingSchedules = await Schedule.find({ batch: targetBatchId, status: 'Scheduled' });
          for (const sched of upcomingSchedules) {
            if (Array.isArray(sched.attendance)) {
              const filtered = sched.attendance.filter(
                (a: any) => (a.studentId?._id || a.studentId || '').toString() !== student._id.toString()
              );
              if (filtered.length !== sched.attendance.length) {
                sched.attendance = filtered;
                await sched.save();
              }
            }
          }

          const otherActiveStudents = await Student.find({
            batch: targetBatchId,
            _id: { $ne: student._id },
            status: { $ne: 'Dropped' }
          });
          if (otherActiveStudents.length === 0) {
            const batchDoc = await Batch.findById(targetBatchId);
            if (batchDoc && batchDoc.status !== 'Dropped') {
              batchDoc.status = 'Dropped';
              await batchDoc.save();
            }
          }
        }
      } else if (newStatus === 'Active') {
        if (targetBatchId) {
          const batchDoc = await Batch.findById(targetBatchId);
          if (batchDoc && batchDoc.status === 'Dropped') {
            batchDoc.status = 'Active';
            await batchDoc.save();
          }
          await syncStudentBatchSchedules(student._id.toString(), targetBatchId);
        }
      }

      serverCache.clearPattern('schedules_');
      serverCache.clearPattern('students_');
      serverCache.clearPattern('batches_');
      serverCache.clearPattern('stats_');
      serverCache.clearPattern('timings_');
      deleteDiskCache('schedules_all');
    }

    // If batch changed or assigned, update counts and sync schedules
    if (oldBatchId && newBatchId && oldBatchId !== newBatchId) {
      await Batch.findByIdAndUpdate(oldBatchId, { $inc: { studentsCount: -1 } });
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
      await syncStudentBatchSchedules(student._id.toString(), newBatchId, oldBatchId);
    } else if (!oldBatchId && newBatchId) {
      await Batch.findByIdAndUpdate(newBatchId, { $inc: { studentsCount: 1 } });
      await syncStudentBatchSchedules(student._id.toString(), newBatchId);
    } else if (newBatchId) {
      await syncStudentBatchSchedules(student._id.toString(), newBatchId);
    }

    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');

    await student.populate('batch', 'name subject status assignedTeacher numberOfSessions');
    await student.populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
    await student.populate('assignedTutor', 'name email');

    res.status(200).json(student);
  } catch (error) {
    console.error('updateStudent error:', error);
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
      paymentDetails,
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
    const isExplicitUnassigned =
      teacherId === null ||
      teacherId === '' ||
      teacherId === 'unassigned' ||
      teacherId === '__unassigned__';

    if (batchId) {
      // Optional fallback if existing batch was explicitly provided
      targetBatchDoc = await Batch.findById(batchId);
      if (targetBatchDoc) {
        let changed = false;
        if (isExplicitUnassigned) {
          if (targetBatchDoc.assignedTeacher) {
            targetBatchDoc.assignedTeacher = undefined;
            changed = true;
          }
        } else if (teacherId && targetBatchDoc.assignedTeacher?.toString() !== teacherId.toString()) {
          targetBatchDoc.assignedTeacher = teacherId;
          changed = true;
        }
        if (targetSessions > 0 && targetBatchDoc.numberOfSessions !== targetSessions) {
          targetBatchDoc.numberOfSessions = targetSessions;
          changed = true;
        }
        if (!targetBatchDoc.isRetention) {
          targetBatchDoc.isRetention = true;
          targetBatchDoc.retentionLevel = finalLevelTag;
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
      const targetTeacherId = isExplicitUnassigned
        ? undefined
        : (teacherId || oldTeacherId || student.assignedTutor || undefined);
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
        isRetention: true,
        retentionLevel: finalLevelTag,
        retentionFromBatch: oldBatchId || undefined,
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
    if (isExplicitUnassigned) {
      student.assignedTutor = undefined;
    } else if (teacherId || targetBatchDoc?.assignedTeacher) {
      student.assignedTutor = teacherId || targetBatchDoc.assignedTeacher;
    }

    await student.save();
    await syncStudentBatchSchedules(student._id.toString(), targetBatchId, oldBatchId);

    // Increment count on target batch only if target batch is different from old batch and was existing
    if (batchId && oldBatchId !== targetBatchId) {
      try {
        await Batch.findByIdAndUpdate(targetBatchId, { $inc: { studentsCount: 1 } });
      } catch (err) {
        console.warn('Failed to increment new batch student count:', err);
      }
    }

    // 5. Next Level Payment Details (if provided)
    if (paymentDetails && paymentDetails.recordPayment && Number(paymentDetails.totalFee) > 0) {
      try {
        const totalFee = Number(paymentDetails.totalFee) || 0;
        const amountPaid = Math.max(0, Number(paymentDetails.amountPaid) || 0);
        const remainingAmount = Math.max(0, totalFee - amountPaid);
        const rawType = paymentDetails.paymentType || (amountPaid >= totalFee ? 'Full Payment' : amountPaid > 0 ? 'Half Payment' : 'Custom Payment');
        const paymentMethod = paymentDetails.paymentMethod || 'Bank Transfer';
        const paymentDate = paymentDetails.paymentDate
          ? (normalizeDateOnlyToUtc(paymentDetails.paymentDate) || new Date(paymentDetails.paymentDate)).toISOString()
          : new Date().toISOString();
        const paymentNotes = paymentDetails.notes || '';
        const dueAfterClasses = calculateDueAfterClasses(targetSessions);
        const paymentStatus = calculatePaymentStatus({
          totalFee,
          amountPaid,
          completedClasses: 0,
          dueAfterClasses,
        });

        const newTx = {
          _id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          amount: amountPaid,
          paymentDate,
          paymentMethod,
          paymentType: rawType === 'Full Payment' ? 'Full Payment' : 'Initial Payment',
          level: finalLevelTag,
          notes: paymentNotes ? `[${finalLevelTag}] ${paymentNotes}` : `Fee payment for ${finalLevelTag}`,
          createdAt: new Date().toISOString(),
        };

        let existingPayment = await Payment.safeFindOne({ student: studentId });
        if (!existingPayment && student.payment) {
          existingPayment = student.payment;
        }

        const paymentPayload: any = {
          student: studentId,
          batch: targetBatchId,
          totalFee,
          amountPaid,
          remainingAmount,
          paymentType: rawType === 'Pending' ? 'Custom Payment' : rawType,
          paymentStatus,
          assignedClasses: targetSessions,
          dueAfterClasses,
          reminderBeforeClasses: 2,
          notes: paymentNotes ? `[${finalLevelTag}] ${paymentNotes}` : `Fee for ${finalLevelTag}`,
          paymentHistory: existingPayment
            ? (amountPaid > 0 ? [newTx, ...(existingPayment.paymentHistory || [])] : (existingPayment.paymentHistory || []))
            : (amountPaid > 0 ? [newTx] : []),
        };

        let savedPayment: any = null;
        if (existingPayment && existingPayment._id) {
          savedPayment = await Payment.safeFindByIdAndUpdate(existingPayment._id, {
            $set: paymentPayload,
          });
        } else {
          savedPayment = await Payment.safeCreate(paymentPayload);
        }

        if (savedPayment) {
          student.payment = savedPayment;
          await student.save();
        }
      } catch (payErr: any) {
        console.error('[advanceStudentLevel] Error recording next level payment:', payErr.message);
      }
    }


    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('schedules_');
    serverCache.clearPattern('stats_');
    serverCache.clearPattern('payments_');
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

export const deleteStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id as string);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    if (student.batch) {
      try {
        await Batch.findByIdAndUpdate(student.batch, { $inc: { studentsCount: -1 } });
      } catch {
        // ignore
      }
    }

    // Save to Recycle Bin before deleting
    await RecycleBin.addToBin({
      entityType: 'student',
      entityId: student._id,
      name: student.name || 'Unnamed Student',
      email: student.email || undefined,
      secondaryInfo: student.phone || student.mobileNumber || (student.batch ? `Batch: ${student.batch}` : ''),
      itemData: student,
      deletedBy: req.user,
    });

    await student.deleteOne();
    serverCache.clearPattern('students_');
    res.status(200).json({ message: 'Student moved to Recycle Bin successfully' });
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

// @desc    Admin Class Progress Correction & Dynamic Calendar Rescheduling
// @route   POST /students/:id/correct-progress
// @access  Private (Admin / Sub-admin)
export const correctStudentProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const {
      totalSessions,
      completedSessions,
      nextSessionNumber,
      nextClassDate,
      nextClassStartTime,
      nextClassEndTime,
    } = req.body;

    const total = Number(totalSessions);
    if (!total || isNaN(total) || total < 1) {
      res.status(400).json({ message: 'Total course sessions must be a positive number (minimum 1).' });
      return;
    }

    const completed = Math.max(0, Number(completedSessions) || 0);
    const nextNum = Number(nextSessionNumber) || (completed + 1);

    if (!nextClassDate) {
      res.status(400).json({ message: 'Next class date is required.' });
      return;
    }

    const nextDateUtc = normalizeDateOnlyToUtc(nextClassDate);
    if (!nextDateUtc) {
      res.status(400).json({ message: 'Valid next class date is required (YYYY-MM-DD).' });
      return;
    }

    const startTime = (nextClassStartTime && typeof nextClassStartTime === 'string' && nextClassStartTime.trim())
      ? nextClassStartTime.trim()
      : '09:00';
    const endTime = (nextClassEndTime && typeof nextClassEndTime === 'string' && nextClassEndTime.trim())
      ? nextClassEndTime.trim()
      : computeEndTime(startTime, 60);

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found.' });
      return;
    }

    const batchId = student.batch?._id ? student.batch._id : student.batch;
    if (!batchId) {
      res.status(400).json({ message: 'Student has no assigned batch. Please assign a batch before editing class progress.' });
      return;
    }

    const batch = await Batch.findById(batchId.toString());
    if (!batch) {
      res.status(404).json({ message: 'Assigned batch not found.' });
      return;
    }

    // 1. Update student & batch metadata as single source of truth
    student.classesNeeded = total;
    batch.numberOfSessions = total;
    batch.preCompletedClasses = completed;
    batch.progressCorrected = true;
    (batch as any).lastProgressCorrection = {
      correctedAt: new Date().toISOString(),
      correctedBy: req.user?._id,
      totalSessions: total,
      completedSessions: completed,
      nextSessionNumber: nextNum,
      nextClassDate,
      nextClassStartTime: startTime,
      nextClassEndTime: endTime,
    };

    await student.save();
    await batch.save();

    // 2. Fetch all batch students
    let batchStudentIds: string[] = [];
    try {
      const studentsInBatch = await Student.find({ batch: batch._id }).select('_id');
      batchStudentIds = studentsInBatch.map((s: any) => s._id.toString());
    } catch {
      // ignore
    }
    if (!batchStudentIds.includes(student._id.toString())) {
      batchStudentIds.push(student._id.toString());
    }

    const teacherId = batch.assignedTeacher?._id
      ? batch.assignedTeacher._id.toString()
      : (batch.assignedTeacher ? batch.assignedTeacher.toString() : undefined);

    let batchTeacherName = '';
    if (teacherId) {
      try {
        const tDoc = await Teacher.findById(teacherId).populate('user', 'name');
        batchTeacherName = tDoc?.name || (tDoc as any)?.user?.name || '';
      } catch {
        // ignore
      }
    }

    // 3. Fetch existing schedules for this batch and sort chronologically
    const existingSchedules = await Schedule.find({ batch: batch._id });
    existingSchedules.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 4. Preserve existing completed classes and attendance records strictly
    let existingCompletedCount = existingSchedules.filter((s: any) => s.status === 'Completed').length;

    // If existing completed classes are fewer than the corrected count, mark past uncompleted scheduled classes as Completed
    if (existingCompletedCount < completed) {
      const pastScheduled = existingSchedules.filter(
        (s: any) => s.status === 'Scheduled' && new Date(s.date).getTime() < nextDateUtc.getTime()
      );
      for (const s of pastScheduled) {
        if (existingCompletedCount >= completed) break;
        s.status = 'Completed';
        s.completedBy = teacherId;
        s.completedByName = batchTeacherName;
        s.notes = s.notes || 'Class completed (admin verified progress)';
        s.sessionNumber = existingCompletedCount + 1;
        if (!s.attendance || s.attendance.length === 0) {
          s.attendance = batchStudentIds.map((stId: string) => ({ studentId: stId, isPresent: true, date: s.date }));
        } else {
          batchStudentIds.forEach((stId: string) => {
            const rec = s.attendance.find((a: any) => (a.studentId?._id || a.studentId || '').toString() === stId);
            if (!rec) s.attendance.push({ studentId: stId, isPresent: true, date: s.date });
            else rec.isPresent = true;
          });
        }
        await s.save();
        existingCompletedCount++;
      }

      // If still fewer, backfill past completed sessions stepping backward on batch days
      if (existingCompletedCount < completed) {
        const assignedDays = Array.isArray(batch.days) && batch.days.length > 0 ? batch.days : ['Monday', 'Wednesday', 'Friday'];
        const dayIndexes = new Set(assignedDays.map((d: string) => DAY_INDEX[d]).filter((idx: any) => idx !== undefined));
        const existingDates = new Set(existingSchedules.map((s: any) => new Date(s.date).getTime()));
        const backCursor = new Date(nextDateUtc.getTime());
        backCursor.setUTCDate(backCursor.getUTCDate() - 1);
        let backDaysScanned = 0;

        while (existingCompletedCount < completed && backDaysScanned < 300) {
          if (dayIndexes.has(backCursor.getUTCDay())) {
            const bTime = backCursor.getTime();
            if (!existingDates.has(bTime)) {
              const slotTiming = getSlotTimingForDay(batch, bTime);
              const sTime = slotTiming.startTime || startTime || '09:00';
              const eTime = slotTiming.endTime || computeEndTime(sTime, 60);
              const dateKey = backCursor.toISOString().split('T')[0];

              await Schedule.create({
                _id: `sched_${batch._id}_${dateKey}_${sTime.replace(':', '')}`,
                batch: batch._id,
                teacher: teacherId,
                completedBy: teacherId,
                completedByName: batchTeacherName,
                date: new Date(bTime),
                startTime: sTime,
                endTime: eTime,
                status: 'Completed',
                sessionNumber: existingCompletedCount + 1,
                subject: batch.subject || 'Class',
                notes: 'Class completed (admin verified progress)',
                attendance: batchStudentIds.map((stId: string) => ({ studentId: stId, isPresent: true, date: new Date(bTime) })),
              });
              existingDates.add(bTime);
              existingCompletedCount++;
            }
          }
          backCursor.setUTCDate(backCursor.getUTCDate() - 1);
          backDaysScanned++;
        }
      }
    }

    // 5. Schedule remaining sessions starting from nextClassDate forward
    const keptScheduleIds = new Set<string>();
    const assignedDays = Array.isArray(batch.days) && batch.days.length > 0 ? batch.days : ['Monday', 'Wednesday', 'Friday'];
    const dayIndexes = new Set(assignedDays.map((d: string) => DAY_INDEX[d]).filter((idx: any) => idx !== undefined));

    if (nextNum <= total) {
      // Next session (e.g. Session 18) on nextDateUtc
      const nextTime = nextDateUtc.getTime();
      let existingOnNextDate = existingSchedules.find(
        (s: any) => s.status === 'Scheduled' && new Date(s.date).getTime() === nextTime
      );

      const conflictRes = teacherId ? await checkTeacherConflict({
        teacherId,
        date: nextDateUtc,
        startTime,
        endTime,
        excludeScheduleId: existingOnNextDate?._id?.toString(),
      }) : { hasConflict: false };

      if (existingOnNextDate) {
        existingOnNextDate.startTime = startTime;
        existingOnNextDate.endTime = endTime;
        existingOnNextDate.sessionNumber = nextNum;
        existingOnNextDate.subject = batch.subject || 'Class';
        existingOnNextDate.notes = `Class ${nextNum} of ${total}`;
        existingOnNextDate.status = 'Scheduled';
        existingOnNextDate.conflict = conflictRes.hasConflict;
        if (teacherId) existingOnNextDate.teacher = teacherId;
        await existingOnNextDate.save();
        keptScheduleIds.add(existingOnNextDate._id.toString());
      } else {
        const dateKey = nextDateUtc.toISOString().split('T')[0];
        const newNextSched = await Schedule.create({
          _id: `sched_${batch._id}_${dateKey}_${startTime.replace(':', '')}`,
          batch: batch._id,
          teacher: teacherId,
          date: nextDateUtc,
          startTime,
          endTime,
          status: 'Scheduled',
          sessionNumber: nextNum,
          subject: batch.subject || 'Class',
          notes: `Class ${nextNum} of ${total}`,
          conflict: conflictRes.hasConflict,
          meetingLink: batch.meetingLink || '',
          attendance: batchStudentIds.map((stId: string) => ({ studentId: stId, isPresent: false, date: nextDateUtc })),
        });
        keptScheduleIds.add(newNextSched._id.toString());
      }

      // Subsequent sessions: (nextNum + 1) up to total on assigned weekdays
      const fwdCursor = new Date(nextTime);
      fwdCursor.setUTCDate(fwdCursor.getUTCDate() + 1);
      let curSession = nextNum + 1;
      let fwdDaysScanned = 0;

      while (curSession <= total && fwdDaysScanned < 400) {
        if (dayIndexes.has(fwdCursor.getUTCDay())) {
          const fTime = fwdCursor.getTime();
          const slotTiming = getSlotTimingForDay(batch, fTime);
          const sTime = slotTiming.startTime || startTime || '09:00';
          const eTime = slotTiming.endTime || computeEndTime(sTime, 60);
          const dateKey = fwdCursor.toISOString().split('T')[0];

          let existingOnDate = existingSchedules.find(
            (s: any) => s.status === 'Scheduled' && new Date(s.date).getTime() === fTime
          );

          const fwdConflict = teacherId ? await checkTeacherConflict({
            teacherId,
            date: new Date(fTime),
            startTime: sTime,
            endTime: eTime,
            excludeScheduleId: existingOnDate?._id?.toString(),
          }) : { hasConflict: false };

          if (existingOnDate) {
            existingOnDate.startTime = sTime;
            existingOnDate.endTime = eTime;
            existingOnDate.sessionNumber = curSession;
            existingOnDate.subject = batch.subject || 'Class';
            existingOnDate.notes = `Class ${curSession} of ${total}`;
            existingOnDate.status = 'Scheduled';
            existingOnDate.conflict = fwdConflict.hasConflict;
            if (teacherId) existingOnDate.teacher = teacherId;
            await existingOnDate.save();
            keptScheduleIds.add(existingOnDate._id.toString());
          } else {
            const newSched = await Schedule.create({
              _id: `sched_${batch._id}_${dateKey}_${sTime.replace(':', '')}`,
              batch: batch._id,
              teacher: teacherId,
              date: new Date(fTime),
              startTime: sTime,
              endTime: eTime,
              status: 'Scheduled',
              sessionNumber: curSession,
              subject: batch.subject || 'Class',
              notes: `Class ${curSession} of ${total}`,
              conflict: fwdConflict.hasConflict,
              meetingLink: batch.meetingLink || '',
              attendance: batchStudentIds.map((stId: string) => ({ studentId: stId, isPresent: false, date: new Date(fTime) })),
            });
            keptScheduleIds.add(newSched._id.toString());
          }
          curSession++;
        }
        fwdCursor.setUTCDate(fwdCursor.getUTCDate() + 1);
        fwdDaysScanned++;
      }
    }

    // 6. Remove obsolete/orphaned Scheduled classes that are NOT in keptScheduleIds
    const orphanedSchedules = existingSchedules.filter((s: any) => {
      if (s.status !== 'Scheduled') return false;
      if (keptScheduleIds.has(s._id.toString())) return false;
      const hasAttendance = Array.isArray(s.attendance) && s.attendance.some((a: any) => a.isPresent);
      return !hasAttendance;
    });

    if (orphanedSchedules.length > 0) {
      const orphanIds = orphanedSchedules.map((s: any) => s._id);
      await Schedule.deleteMany({ _id: { $in: orphanIds } });
    }

    // 7. Update batch status if completed
    if (completed >= total) {
      batch.status = 'Completed';
      await batch.save();
    } else if (batch.status === 'Completed' && completed < total) {
      batch.status = 'Active';
      await batch.save();
    }

    // 8. Invalidate all caches
    serverCache.clearPattern('schedules_');
    serverCache.clearPattern('students_');
    serverCache.clearPattern('batches_');
    serverCache.clearPattern('timings_');
    serverCache.clearPattern('stats_');
    deleteDiskCache('schedules_all');
    deleteDiskCache('students_all');
    deleteDiskCache('batches_all');

    res.status(200).json({
      message: 'Class progress and schedule updated successfully',
      student,
      batch,
      totalSessions: total,
      completedSessions: completed,
      nextSessionNumber: nextNum,
      nextClassDate,
      nextClassStartTime: startTime,
      upcomingSessionsCount: Math.max(0, total - nextNum + 1),
    });
  } catch (error: any) {
    console.error('Error correcting student progress:', error);
    res.status(500).json({ message: 'Failed to correct class progress', detail: error.message });
  }
};

function clearStudentScheduleCaches(teacherIds: string[] = []): void {
  serverCache.clearPattern('schedules_');
  serverCache.clearPattern('students_');
  serverCache.clearPattern('batches_');
  serverCache.clearPattern('timings_');
  serverCache.clearPattern('stats_');
  serverCache.delete('teachers_all');
  deleteDiskCache('schedules_all');
  deleteDiskCache('students_all');
  deleteDiskCache('batches_all');
  teacherIds.forEach((tId) => {
    if (tId) deleteDiskCache(`schedules_teacher_${tId}`);
  });
}

async function resolveTeacherDisplay(teacherId?: string): Promise<string> {
  if (!teacherId) return 'Unassigned';
  try {
    const tDoc = await Teacher.findById(teacherId).populate('user', 'name');
    return tDoc?.name || (tDoc as any)?.user?.name || 'Assigned Tutor';
  } catch {
    return 'Assigned Tutor';
  }
}

function buildScheduleArchiveSnapshot(schedules: any[], defaultTeacherName: string) {
  return [...schedules]
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((s: any) => ({
      scheduleId: s._id?.toString(),
      date: s.date,
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      status: s.originalStatus || s.status,
      sessionNumber: s.sessionNumber,
      subject: s.subject || '',
      notes: s.notes || '',
      teacherName: s.completedByName || defaultTeacherName,
      isExtraClass: Boolean(s.isExtraClass),
    }));
}

function countCompletedForStudent(schedules: any[], studentId: string, isGroupBatch: boolean, fallbackPreCompleted = 0): number {
  let completed = 0;
  for (const s of schedules) {
    // Never count Cancelled, Paused, or Archived uncompleted sessions as completed
    if (s.status !== 'Completed') continue;
    if (isGroupBatch && Array.isArray(s.attendance) && s.attendance.length > 0) {
      const rec = s.attendance.find((a: any) => (a.studentId?._id || a.studentId || '').toString() === studentId);
      if (rec && rec.isPresent === false) continue;
    }
    completed++;
  }
  return Math.max(completed, Math.max(0, Number(fallbackPreCompleted) || 0));
}

// @desc    Temporarily pause a student's classes, archive upcoming slots, and log pause metadata
// @route   POST /students/:id/pause-classes
// @access  Private/Admin
export const pauseStudentClasses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const { pauseDate, reason } = req.body || {};

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found.' });
      return;
    }
    if (student.status === 'Dropped') {
      res.status(400).json({ message: 'Cannot pause a dropped student. Reactivate the student first.' });
      return;
    }

    const normalizedPauseDate = pauseDate
      ? (normalizeDateOnlyToUtc(pauseDate) || new Date())
      : (normalizeDateOnlyToUtc(getKolkataNow().todayStr) || new Date());
    const pauseReasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Paused by Admin';

    const batchId = student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : '');
    const batchDoc: any = batchId ? await Batch.findById(batchId) : null;

    const currentTeacherId =
      (student.assignedTutor?._id ? student.assignedTutor._id.toString() : (student.assignedTutor ? student.assignedTutor.toString() : '')) ||
      (batchDoc?.assignedTeacher?._id ? batchDoc.assignedTeacher._id.toString() : (batchDoc?.assignedTeacher ? batchDoc.assignedTeacher.toString() : ''));
    const previousTeacherName = await resolveTeacherDisplay(currentTeacherId);

    const otherActiveStudents = batchId
      ? await Student.find({
        batch: batchId,
        _id: { $ne: student._id },
        status: { $nin: ['Dropped', 'Paused'] },
      }).select('_id')
      : [];
    const isGroupBatch = otherActiveStudents.length > 0;

    const batchSchedules = batchId
      ? await Schedule.find({ batch: batchId }).sort({ date: 1 })
      : [];
    const activeBatchSchedules = batchSchedules.filter((s: any) => !s.isArchived && s.status !== 'Archived' && s.status !== 'Paused');

    const completedCount = countCompletedForStudent(
      batchSchedules,
      studentId,
      isGroupBatch,
      batchDoc?.preCompletedClasses || 0
    );
    const totalSessions = Number(student.classesNeeded || batchDoc?.numberOfSessions || 15);
    const remainingCount = Math.max(0, totalSessions - completedCount);

    const historyEntryId = `pr_${Date.now()}`;
    const archivedSnapshot = buildScheduleArchiveSnapshot(activeBatchSchedules, previousTeacherName);

    if (batchDoc && !isGroupBatch) {
      // 1-on-1 batch: archive upcoming unconducted Scheduled sessions without deleting records, and pause batch generation
      for (const s of activeBatchSchedules) {
        if (s.status === 'Scheduled') {
          s.originalStatus = 'Scheduled';
          s.status = 'Paused';
          s.isArchived = true;
          s.archivedAt = new Date();
          s.archiveReason = pauseReasonStr;
          s.archiveSessionId = historyEntryId;
          s.archivedForStudent = student._id;
          await s.save();
        }
      }
      if (batchDoc.status !== 'Completed' && batchDoc.status !== 'Dropped') {
        batchDoc.status = 'Paused';
        batchDoc.preCompletedClasses = completedCount;
        await batchDoc.save();
      }
    } else if (batchDoc && isGroupBatch) {
      // Group batch: remove only the paused student from upcoming unconducted classes; peers continue unaffected
      for (const s of activeBatchSchedules) {
        if (s.status === 'Scheduled' && Array.isArray(s.attendance)) {
          const filtered = s.attendance.filter(
            (a: any) => (a.studentId?._id || a.studentId || '').toString() !== student._id.toString()
          );
          if (filtered.length !== s.attendance.length) {
            s.attendance = filtered;
            await s.save();
          }
        }
      }
    }

    if (!Array.isArray(student.restartHistory)) {
      student.restartHistory = [];
    }

    student.restartHistory.push({
      id: historyEntryId,
      status: 'Paused',
      pauseDate: normalizedPauseDate,
      reason: pauseReasonStr,
      pausedBy: req.user?._id,
      restartDate: null,
      previousBatchId: batchId || undefined,
      previousBatchName: batchDoc?.name || '',
      previousBatchType: isGroupBatch ? 'Group' : '1:1',
      previousTeacherId: currentTeacherId || undefined,
      previousTeacherName,
      previousSchedule: {
        days: Array.isArray(batchDoc?.days) ? [...batchDoc.days] : [],
        timing: batchDoc?.timing ? { ...batchDoc.timing } : {},
        dayTimings: batchDoc?.dayTimings ? { ...batchDoc.dayTimings } : {},
        startDate: batchDoc?.startDate || null,
      },
      completedAtPause: completedCount,
      remainingAtPause: remainingCount,
      totalClasses: totalSessions,
      archivedSchedules: archivedSnapshot,
      createdAt: new Date(),
    });

    student.status = 'Paused';
    student.isPaused = true;
    student.pauseDate = normalizedPauseDate;
    student.pauseReason = pauseReasonStr;
    if (student.restartDetails) {
      student.restartDetails = { ...student.restartDetails, restartStatus: 'Paused' };
    }
    await student.save();

    clearStudentScheduleCaches([currentTeacherId]);

    res.status(200).json({
      message: 'Student classes paused successfully.',
      student,
      completedClasses: completedCount,
      remainingClasses: remainingCount,
    });
  } catch (error: any) {
    console.error('Error pausing student classes:', error);
    res.status(500).json({ message: 'Failed to pause student classes', detail: error.message });
  }
};

function computeRestartDurationMinutes(startTime?: string, endTime?: string, explicitDuration?: any): number {
  const dur = Number(explicitDuration);
  if (!isNaN(dur) && dur >= 15 && dur <= 360) return Math.round(dur);
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (!isNaN(sh) && !isNaN(eh)) {
      let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
      if (diff <= 0) diff += 24 * 60;
      if (diff >= 15 && diff <= 360) return diff;
    }
  }
  return 60;
}

function normalizeRestartScheduleInput(params: {
  days?: any;
  dayTimings?: any;
  timing?: any;
  durationMinutes?: any;
  fallbackBatch?: any;
}) {
  const { days, dayTimings, timing, durationMinutes, fallbackBatch } = params;
  const orderedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const rawDays = Array.isArray(days) && days.length > 0
    ? days.map((d: any) => String(d).trim()).filter((d: string) => DAY_INDEX[d] !== undefined)
    : (Array.isArray(fallbackBatch?.days) && fallbackBatch.days.length > 0 ? fallbackBatch.days : ['Monday', 'Wednesday', 'Friday']);
  const uniqueDays = orderedDays.filter((d) => rawDays.includes(d));
  const finalDays = uniqueDays.length > 0 ? uniqueDays : ['Monday', 'Wednesday', 'Friday'];

  const fallbackStart = (timing?.startTime && typeof timing.startTime === 'string' && timing.startTime.trim())
    ? timing.startTime.trim()
    : (fallbackBatch?.timing?.startTime || '09:00');
  const resolvedDuration = computeRestartDurationMinutes(
    fallbackStart,
    timing?.endTime || fallbackBatch?.timing?.endTime,
    durationMinutes ?? fallbackBatch?.durationMinutes
  );

  const sourceDayTimings = (dayTimings && typeof dayTimings === 'object')
    ? dayTimings
    : (fallbackBatch?.dayTimings || {});
  const normalizedDayTimings: Record<string, { startTime: string; endTime: string }> = {};
  for (const day of finalDays) {
    const entry = sourceDayTimings[day] || sourceDayTimings[day.toLowerCase()];
    const sTime = (entry?.startTime && typeof entry.startTime === 'string' && entry.startTime.trim())
      ? entry.startTime.trim()
      : fallbackStart;
    normalizedDayTimings[day] = {
      startTime: sTime,
      endTime: computeEndTime(sTime, resolvedDuration),
    };
  }

  const primaryDay = finalDays[0];
  const primaryTiming = normalizedDayTimings[primaryDay] || {
    startTime: fallbackStart,
    endTime: computeEndTime(fallbackStart, resolvedDuration),
  };
  const distinctStarts = new Set(finalDays.map((d) => normalizedDayTimings[d].startTime));
  const timeMode: 'same' | 'different' = distinctStarts.size > 1 ? 'different' : 'same';

  return {
    days: finalDays,
    dayTimings: normalizedDayTimings,
    timing: primaryTiming,
    durationMinutes: resolvedDuration,
    timeMode,
  };
}

// @desc    Restart student classes from a new restart date, archive old schedule records, and generate remaining sessions
// @route   POST /students/:id/restart-classes
// @access  Private/Admin
export const restartStudentClasses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const { restartDate, days, timing, dayTimings, durationMinutes, teacherId } = req.body || {};

    if (!restartDate) {
      res.status(400).json({ message: 'Restart date is required.' });
      return;
    }

    const restartDateUtc = normalizeDateOnlyToUtc(restartDate);
    if (!restartDateUtc) {
      res.status(400).json({ message: 'Please provide a valid restart date (YYYY-MM-DD).' });
      return;
    }

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found.' });
      return;
    }

    const oldBatchId = student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : '');
    if (!oldBatchId) {
      res.status(400).json({ message: 'Student does not have an assigned batch to restart.' });
      return;
    }

    const oldBatchDoc: any = await Batch.findById(oldBatchId);
    if (!oldBatchDoc) {
      res.status(404).json({ message: 'Student batch not found.' });
      return;
    }

    const oldTeacherId =
      (student.assignedTutor?._id ? student.assignedTutor._id.toString() : (student.assignedTutor ? student.assignedTutor.toString() : '')) ||
      (oldBatchDoc.assignedTeacher?._id ? oldBatchDoc.assignedTeacher._id.toString() : (oldBatchDoc.assignedTeacher ? oldBatchDoc.assignedTeacher.toString() : ''));
    const previousTeacherName = await resolveTeacherDisplay(oldTeacherId);

    const isExplicitUnassigned =
      teacherId === null ||
      teacherId === '' ||
      teacherId === 'unassigned' ||
      teacherId === '__unassigned__';
    const resolvedTeacherId = isExplicitUnassigned
      ? undefined
      : (teacherId ? String(teacherId) : (oldTeacherId || undefined));
    const newTeacherName = await resolveTeacherDisplay(resolvedTeacherId);

    const normalizedSched = normalizeRestartScheduleInput({
      days,
      dayTimings,
      timing,
      durationMinutes,
      fallbackBatch: oldBatchDoc,
    });

    const otherActiveStudents = await Student.find({
      batch: oldBatchId,
      _id: { $ne: student._id },
      status: { $nin: ['Dropped', 'Paused'] },
    }).select('_id');
    const isGroupBatch = otherActiveStudents.length > 0;

    const allOldSchedules = await Schedule.find({ batch: oldBatchId }).sort({ date: 1 });
    const nonArchivedOldSchedules = allOldSchedules.filter((s: any) => !s.isArchived && s.status !== 'Archived' && s.status !== 'Paused');

    if (!Array.isArray(student.restartHistory)) {
      student.restartHistory = [];
    }
    const pendingPauseIdx = [...student.restartHistory]
      .reverse()
      .findIndex((rh: any) => rh.status === 'Paused' && !rh.restartDate);
    const actualPauseIdx = pendingPauseIdx >= 0 ? (student.restartHistory.length - 1 - pendingPauseIdx) : -1;
    const latestPauseEntry = actualPauseIdx >= 0 ? student.restartHistory[actualPauseIdx] : null;

    // Preserve completed class count accurately (never reset completed classes; never count cancelled/paused sessions)
    const calculatedCompleted = countCompletedForStudent(
      allOldSchedules,
      studentId,
      isGroupBatch,
      oldBatchDoc.preCompletedClasses || 0
    );
    const completedCount = Math.max(calculatedCompleted, Number(latestPauseEntry?.completedAtPause) || 0);
    const totalSessions = Number(student.classesNeeded || oldBatchDoc.numberOfSessions || 15);
    const remainingCount = Math.max(0, totalSessions - completedCount);

    const historyEntryId = latestPauseEntry?.id || `pr_${Date.now()}`;
    const archivedSnapshot = (latestPauseEntry?.archivedSchedules && latestPauseEntry.archivedSchedules.length > 0)
      ? latestPauseEntry.archivedSchedules
      : buildScheduleArchiveSnapshot(nonArchivedOldSchedules, previousTeacherName);
    const previousScheduleStatus = archivedSnapshot.some((s: any) => s.status === 'Scheduled' || s.status === 'Paused')
      ? 'Archived'
      : (archivedSnapshot.length > 0 ? 'Completed' : 'Preserved');

    let targetBatchDoc: any = oldBatchDoc;

    if (isGroupBatch) {
      // Group batch: keep peers' ongoing Group Batch untouched; give restarting student a fresh continuation batch from restartDate
      for (const s of nonArchivedOldSchedules) {
        if (s.status === 'Scheduled' && Array.isArray(s.attendance)) {
          const filtered = s.attendance.filter(
            (a: any) => (a.studentId?._id || a.studentId || '').toString() !== student._id.toString()
          );
          if (filtered.length !== s.attendance.length) {
            s.attendance = filtered;
            await s.save();
          }
        }
      }

      const updateCount = Math.max(0, (Number(oldBatchDoc.studentsCount) || 1) - 1);
      await Batch.findByIdAndUpdate(oldBatchId, { $set: { studentsCount: updateCount } });

      const studentLvlNum = extractLevelNumber(student.currentLevel || student.level || oldBatchDoc.name || oldBatchDoc.subject);
      const levelTag = student.currentLevel || student.level || extractLevel(oldBatchDoc.name, 'Level 1');
      const isRetentionBatch = studentLvlNum !== null ? studentLvlNum >= 2 : Boolean(oldBatchDoc.isRetention);

      targetBatchDoc = await Batch.create({
        name: `${student.name ? student.name.trim() : 'Student'} - ${levelTag} (Restarted)`,
        subject: oldBatchDoc.subject || 'General',
        assignedTeacher: resolvedTeacherId,
        numberOfSessions: totalSessions,
        preCompletedClasses: completedCount,
        preRestartCompletedClasses: completedCount,
        isRestarted: true,
        lastRestartDate: restartDateUtc,
        studentsCount: 1,
        status: remainingCount > 0 ? 'Active' : 'Completed',
        isRetention: isRetentionBatch,
        retentionLevel: isRetentionBatch ? levelTag : undefined,
        restartedFromBatch: oldBatchId,
        days: normalizedSched.days,
        timing: normalizedSched.timing,
        timeMode: normalizedSched.timeMode,
        dayTimings: normalizedSched.dayTimings,
        durationMinutes: normalizedSched.durationMinutes,
        meetingLink: oldBatchDoc.meetingLink || '',
        startDate: restartDateUtc,
        durationType: oldBatchDoc.durationType || 'Custom',
      });

      student.batch = targetBatchDoc._id.toString();
    } else {
      // 1-on-1 batch: archive only uncompleted previous schedule records (preserve Completed records visibly)
      for (const s of allOldSchedules) {
        if (s.isArchived || s.status === 'Completed') continue;
        if (s.status === 'Scheduled') {
          s.originalStatus = 'Scheduled';
          s.status = 'Archived';
        }
        s.isArchived = true;
        s.archivedAt = new Date();
        s.archiveSessionId = historyEntryId;
        s.archiveReason = s.archiveReason || 'Schedule Reset on Restart';
        s.archivedForStudent = student._id;
        await s.save();
      }

      oldBatchDoc.days = normalizedSched.days;
      oldBatchDoc.timing = normalizedSched.timing;
      oldBatchDoc.timeMode = normalizedSched.timeMode;
      oldBatchDoc.dayTimings = normalizedSched.dayTimings;
      oldBatchDoc.durationMinutes = normalizedSched.durationMinutes;
      oldBatchDoc.assignedTeacher = resolvedTeacherId;
      oldBatchDoc.startDate = restartDateUtc;
      oldBatchDoc.preCompletedClasses = completedCount;
      oldBatchDoc.preRestartCompletedClasses = completedCount;
      oldBatchDoc.isRestarted = true;
      oldBatchDoc.lastRestartDate = restartDateUtc;
      oldBatchDoc.numberOfSessions = totalSessions;
      oldBatchDoc.status = remainingCount > 0 ? 'Active' : 'Completed';
      await oldBatchDoc.save();
    }

    // Generate ONLY remaining future classes strictly starting from restartDateUtc (zero duplicates)
    const generatedCount = await generateRestartedSchedulesForBatch({
      batch: targetBatchDoc,
      restartDateUtc,
      completedCount,
      totalSessions,
      studentId: student._id.toString(),
      restartTag: historyEntryId,
    });

    const newScheduleInfo = {
      days: normalizedSched.days,
      timing: normalizedSched.timing,
      dayTimings: normalizedSched.dayTimings,
      durationMinutes: normalizedSched.durationMinutes,
      timeMode: normalizedSched.timeMode,
      startDate: restartDateUtc,
    };

    if (actualPauseIdx >= 0) {
      student.restartHistory[actualPauseIdx] = {
        ...student.restartHistory[actualPauseIdx],
        status: 'Restarted',
        previousScheduleStatus,
        restartDate: restartDateUtc,
        restartedBy: req.user?._id,
        newBatchId: targetBatchDoc._id.toString(),
        newBatchName: targetBatchDoc.name,
        newTeacherId: resolvedTeacherId || undefined,
        newTeacherName,
        newSchedule: newScheduleInfo,
        completedAtRestart: completedCount,
        remainingAtRestart: remainingCount,
        generatedSessionsCount: generatedCount,
        archivedSchedules: archivedSnapshot,
        editHistory: Array.isArray(student.restartHistory[actualPauseIdx].editHistory)
          ? student.restartHistory[actualPauseIdx].editHistory
          : [],
      };
    } else {
      student.restartHistory.push({
        id: historyEntryId,
        status: 'Restarted',
        previousScheduleStatus,
        pauseDate: student.pauseDate || new Date(),
        reason: student.pauseReason || 'Schedule Reset / Restart',
        pausedBy: req.user?._id,
        restartDate: restartDateUtc,
        restartedBy: req.user?._id,
        previousBatchId: oldBatchId,
        previousBatchName: oldBatchDoc.name || '',
        previousBatchType: isGroupBatch ? 'Group' : '1:1',
        previousTeacherId: oldTeacherId || undefined,
        previousTeacherName,
        previousSchedule: {
          days: Array.isArray(oldBatchDoc.days) ? [...oldBatchDoc.days] : [],
          timing: oldBatchDoc.timing ? { ...oldBatchDoc.timing } : {},
          dayTimings: oldBatchDoc.dayTimings ? { ...oldBatchDoc.dayTimings } : {},
          durationMinutes: oldBatchDoc.durationMinutes || 60,
          startDate: oldBatchDoc.startDate || null,
        },
        newBatchId: targetBatchDoc._id.toString(),
        newBatchName: targetBatchDoc.name,
        newTeacherId: resolvedTeacherId || undefined,
        newTeacherName,
        newSchedule: newScheduleInfo,
        completedAtPause: completedCount,
        remainingAtPause: remainingCount,
        completedAtRestart: completedCount,
        remainingAtRestart: remainingCount,
        totalClasses: totalSessions,
        generatedSessionsCount: generatedCount,
        archivedSchedules: archivedSnapshot,
        editHistory: [],
        createdAt: new Date(),
      });
    }

    student.restartDetails = {
      historyEntryId,
      restartDate: restartDateUtc,
      days: normalizedSched.days,
      dayTimings: normalizedSched.dayTimings,
      timing: normalizedSched.timing,
      durationMinutes: normalizedSched.durationMinutes,
      timeMode: normalizedSched.timeMode,
      teacherId: resolvedTeacherId || undefined,
      teacherName: newTeacherName,
      previousScheduleStatus,
      restartStatus: 'Active',
      updatedAt: new Date(),
    };

    student.status = 'Active';
    student.isPaused = false;
    student.lastRestartDate = restartDateUtc;
    student.assignedTutor = resolvedTeacherId || undefined;
    await student.save();

    clearStudentScheduleCaches([oldTeacherId, resolvedTeacherId || '']);

    await student.populate('batch', STUDENT_BATCH_POPULATE_FIELDS);
    await student.populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
    await student.populate('assignedTutor', 'name email');

    res.status(200).json({
      message: `Classes restarted from ${restartDate}. Generated ${generatedCount} upcoming class(es) with ${completedCount} completed class(es) preserved.`,
      student,
      batch: targetBatchDoc,
      completedClasses: completedCount,
      remainingClasses: remainingCount,
      generatedSessionsCount: generatedCount,
    });
  } catch (error: any) {
    console.error('Error restarting student classes:', error);
    res.status(500).json({ message: 'Failed to restart student classes', detail: error.message });
  }
};

// @desc    Edit saved restart schedule details (date, days, per-day start times, duration, teacher) and surgically update future schedules
// @route   PUT /students/:id/restart-classes
// @access  Private/Admin
export const updateStudentRestartDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.id as string;
    const { restartDate, days, dayTimings, timing, durationMinutes, teacherId, historyEntryId } = req.body || {};

    if (!restartDate) {
      res.status(400).json({ message: 'Restart date is required.' });
      return;
    }
    const restartDateUtc = normalizeDateOnlyToUtc(restartDate);
    if (!restartDateUtc) {
      res.status(400).json({ message: 'Please provide a valid restart date (YYYY-MM-DD).' });
      return;
    }
    if (!Array.isArray(days) || days.length === 0) {
      res.status(400).json({ message: 'Please select at least one class day.' });
      return;
    }

    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found.' });
      return;
    }

    const batchId = student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : '');
    if (!batchId) {
      res.status(400).json({ message: 'Student does not have an assigned batch.' });
      return;
    }

    const targetBatchDoc: any = await Batch.findById(batchId);
    if (!targetBatchDoc) {
      res.status(404).json({ message: 'Student batch not found.' });
      return;
    }

    const otherActiveStudents = await Student.find({
      batch: batchId,
      _id: { $ne: student._id },
      status: { $nin: ['Dropped', 'Paused'] },
    }).select('_id');
    if (otherActiveStudents.length > 0) {
      res.status(400).json({
        message: 'Student is currently sharing a group batch with active peers. Use Restart Classes first to isolate their personal continuation schedule.',
      });
      return;
    }

    const oldTeacherId =
      (student.assignedTutor?._id ? student.assignedTutor._id.toString() : (student.assignedTutor ? student.assignedTutor.toString() : '')) ||
      (targetBatchDoc.assignedTeacher?._id ? targetBatchDoc.assignedTeacher._id.toString() : (targetBatchDoc.assignedTeacher ? targetBatchDoc.assignedTeacher.toString() : ''));

    const isExplicitUnassigned =
      teacherId === null ||
      teacherId === '' ||
      teacherId === 'unassigned' ||
      teacherId === '__unassigned__';
    const resolvedTeacherId = isExplicitUnassigned
      ? undefined
      : (teacherId ? String(teacherId) : undefined);
    const newTeacherName = await resolveTeacherDisplay(resolvedTeacherId);

    const normalizedSched = normalizeRestartScheduleInput({
      days,
      dayTimings,
      timing,
      durationMinutes,
      fallbackBatch: targetBatchDoc,
    });

    const existingBatchSchedules = await Schedule.find({ batch: targetBatchDoc._id }).sort({ date: 1 });
    const batchCompletedCount = countCompletedForStudent(
      existingBatchSchedules,
      studentId,
      false,
      targetBatchDoc.preCompletedClasses || 0
    );
    const completedCount = targetBatchDoc.restartedFromBatch
      ? Math.max(
          Number(targetBatchDoc.preCompletedClasses) || 0,
          (Number(targetBatchDoc.preRestartCompletedClasses) || 0) + existingBatchSchedules.filter((s: any) => s.status === 'Completed').length
        )
      : batchCompletedCount;
    const totalSessions = Number(student.classesNeeded || targetBatchDoc.numberOfSessions || 15);
    const remainingCount = Math.max(0, totalSessions - completedCount);

    // Update batch configuration cleanly
    targetBatchDoc.days = normalizedSched.days;
    targetBatchDoc.dayTimings = normalizedSched.dayTimings;
    targetBatchDoc.timing = normalizedSched.timing;
    targetBatchDoc.timeMode = normalizedSched.timeMode;
    targetBatchDoc.durationMinutes = normalizedSched.durationMinutes;
    targetBatchDoc.assignedTeacher = resolvedTeacherId;
    targetBatchDoc.startDate = restartDateUtc;
    targetBatchDoc.preCompletedClasses = completedCount;
    if (!targetBatchDoc.restartedFromBatch && targetBatchDoc.preRestartCompletedClasses === undefined) {
      targetBatchDoc.preRestartCompletedClasses = completedCount;
    }
    targetBatchDoc.isRestarted = true;
    targetBatchDoc.lastRestartDate = restartDateUtc;
    targetBatchDoc.numberOfSessions = totalSessions;
    targetBatchDoc.status = student.isPaused ? 'Paused' : (remainingCount > 0 ? 'Active' : 'Completed');
    await targetBatchDoc.save();

    // Update affected regular future Scheduled sessions surgically; NEVER touch Completed, Archived, Paused, Cancelled, Extra, or attendance-marked rows
    let updatedSessionsCount = 0;
    let deletedSessionsCount = 0;
    let createdSessionsCount = 0;

    if (!student.isPaused) {
      const selectedDayIndexes = new Set(
        normalizedSched.days.map((d: string) => DAY_INDEX[d]).filter((d: any) => d !== undefined)
      );

      // Dates already occupied by active Completed or attendance-marked/extra sessions (never moved or duplicated)
      const lockedFutureOrCompletedTimes = new Set<number>();
      const preservedScheduledCount = existingBatchSchedules.filter((s: any) => {
        if (s.isArchived || s.status !== 'Scheduled' || s.isExtraClass) return false;
        const hasAtt = Array.isArray(s.attendance) && s.attendance.some((a: any) => a.isPresent !== undefined);
        if (hasAtt) {
          const dt = normalizeDateOnlyToUtc(s.date)?.getTime();
          if (dt) lockedFutureOrCompletedTimes.add(dt);
          return true;
        }
        return false;
      }).length;

      existingBatchSchedules.forEach((s: any) => {
        if (!s.isArchived && (s.status === 'Completed' || (s.status === 'Scheduled' && s.isExtraClass))) {
          const dt = normalizeDateOnlyToUtc(s.date)?.getTime();
          if (dt) lockedFutureOrCompletedTimes.add(dt);
        }
      });

      const targetDatesNeeded = Math.max(0, remainingCount - preservedScheduledCount);
      const targetDateTimeSet = new Set<number>();
      const cursor = new Date(restartDateUtc.getTime());
      let scanned = 0;
      while (targetDateTimeSet.size < targetDatesNeeded && scanned < 450) {
        if (selectedDayIndexes.has(cursor.getUTCDay())) {
          const cTime = cursor.getTime();
          if (!lockedFutureOrCompletedTimes.has(cTime)) {
            targetDateTimeSet.add(cTime);
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        scanned++;
      }

      const regularEditableScheduled = existingBatchSchedules.filter((s: any) => {
        if (s.isArchived || s.status !== 'Scheduled' || s.isExtraClass) return false;
        const hasAtt = Array.isArray(s.attendance) && s.attendance.some((a: any) => a.isPresent !== undefined);
        return !hasAtt;
      });

      const idsToDelete: string[] = [];
      const keptEditable: any[] = [];
      for (const s of regularEditableScheduled) {
        const sTime = normalizeDateOnlyToUtc(s.date)?.getTime();
        if (!sTime || !targetDateTimeSet.has(sTime)) {
          idsToDelete.push(s._id.toString());
        } else {
          keptEditable.push(s);
        }
      }

      if (idsToDelete.length > 0) {
        await Schedule.deleteMany({ _id: { $in: idsToDelete } });
        deletedSessionsCount = idsToDelete.length;
      }

      // Build conflict map once in O(N) if teacher is assigned
      const teacherSlotsByDate = new Map<string, any[]>();
      if (resolvedTeacherId) {
        const [tSchedsRaw, tDemos] = await Promise.all([
          Schedule.find({ teacher: resolvedTeacherId, status: { $nin: ['Cancelled', 'Archived', 'Paused'] } }).select('date startTime endTime batch _id isArchived'),
          DemoSession.find({ teacher: resolvedTeacherId, status: { $ne: 'Cancelled' } }).select('date startTime endTime'),
        ]);
        const tScheds = tSchedsRaw.filter((s: any) => !s.isArchived);
        for (const item of [...tScheds, ...tDemos]) {
          if (!item.date || !item.startTime || !item.endTime) continue;
          const dStr = normalizeDateOnlyToUtc(item.date)?.toISOString().split('T')[0];
          if (!dStr) continue;
          const list = teacherSlotsByDate.get(dStr) || [];
          list.push(item);
          teacherSlotsByDate.set(dStr, list);
        }
      }

      // Surgically update ONLY kept future schedules whose day timing/teacher/conflict changed
      for (const s of keptEditable) {
        const slotTiming = getSlotTimingForDay(targetBatchDoc, s.date);
        const sDateStr = normalizeDateOnlyToUtc(s.date)?.toISOString().split('T')[0] || '';
        const daySlots = (teacherSlotsByDate.get(sDateStr) || []).filter(
          (item: any) => item._id?.toString() !== s._id?.toString()
        );
        const isConflict = resolvedTeacherId
          ? checkIntervalConflict(daySlots, { startTime: slotTiming.startTime, endTime: slotTiming.endTime })
          : false;
        const currTeacherId = s.teacher?._id ? s.teacher._id.toString() : (s.teacher ? s.teacher.toString() : '');

        if (
          s.startTime !== slotTiming.startTime ||
          s.endTime !== slotTiming.endTime ||
          currTeacherId !== (resolvedTeacherId || '') ||
          Boolean(s.conflict) !== Boolean(isConflict)
        ) {
          s.startTime = slotTiming.startTime;
          s.endTime = slotTiming.endTime;
          s.teacher = resolvedTeacherId || undefined;
          s.conflict = isConflict;
          await s.save();
          updatedSessionsCount++;
        }
      }

      // Generate any newly added dates / weekdays strictly from restartDateUtc
      createdSessionsCount = await generateRestartedSchedulesForBatch({
        batch: targetBatchDoc,
        restartDateUtc,
        completedCount,
        totalSessions,
        studentId: student._id.toString(),
        restartTag: `edit_${Date.now()}`,
      });

      // Ensure regular Scheduled session numbers remain chronologically ordered
      const finalRegularScheduled = (await Schedule.find({ batch: targetBatchDoc._id }))
        .filter((s: any) => !s.isArchived && s.status === 'Scheduled' && !s.isExtraClass)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (let i = 0; i < finalRegularScheduled.length; i++) {
        const s = finalRegularScheduled[i];
        const targetNum = completedCount + i + 1;
        const targetNotes = `Class ${targetNum} of ${totalSessions}`;
        if (s.sessionNumber !== targetNum || (!s.notes || s.notes.startsWith('Class ')) && s.notes !== targetNotes) {
          s.sessionNumber = targetNum;
          if (!s.notes || s.notes.startsWith('Class ')) s.notes = targetNotes;
          await s.save();
        }
      }
    }

    // Record edit history and updated restart details on Student
    if (!Array.isArray(student.restartHistory)) {
      student.restartHistory = [];
    }

    let targetIdx = -1;
    if (historyEntryId) {
      targetIdx = student.restartHistory.findIndex((rh: any) => rh.id === historyEntryId);
    }
    if (targetIdx < 0 && student.restartHistory.length > 0) {
      targetIdx = student.restartHistory.length - 1;
    }

    const newScheduleInfo = {
      days: normalizedSched.days,
      timing: normalizedSched.timing,
      dayTimings: normalizedSched.dayTimings,
      durationMinutes: normalizedSched.durationMinutes,
      timeMode: normalizedSched.timeMode,
      startDate: restartDateUtc,
    };

    const prevEntry = targetIdx >= 0 ? student.restartHistory[targetIdx] : null;
    const prevTeacherName = prevEntry?.newTeacherName || (await resolveTeacherDisplay(oldTeacherId));
    const editLogItem = {
      id: `re_${Date.now()}`,
      editedAt: new Date(),
      editedBy: req.user?._id,
      editedByName: req.user?.name || 'Admin',
      previousValues: {
        restartDate: prevEntry?.restartDate || student.lastRestartDate || targetBatchDoc.startDate || null,
        days: prevEntry?.newSchedule?.days || targetBatchDoc.days || [],
        dayTimings: prevEntry?.newSchedule?.dayTimings || targetBatchDoc.dayTimings || {},
        timing: prevEntry?.newSchedule?.timing || targetBatchDoc.timing || {},
        durationMinutes: prevEntry?.newSchedule?.durationMinutes || targetBatchDoc.durationMinutes || 60,
        teacherId: prevEntry?.newTeacherId || oldTeacherId || undefined,
        teacherName: prevTeacherName,
      },
      newValues: {
        restartDate: restartDateUtc,
        days: normalizedSched.days,
        dayTimings: normalizedSched.dayTimings,
        timing: normalizedSched.timing,
        durationMinutes: normalizedSched.durationMinutes,
        teacherId: resolvedTeacherId || undefined,
        teacherName: newTeacherName,
      },
    };

    const prevScheduleStatus = prevEntry?.previousScheduleStatus || (prevEntry?.archivedSchedules?.length ? 'Archived' : 'Preserved');

    if (targetIdx >= 0) {
      const existingEdits = Array.isArray(student.restartHistory[targetIdx].editHistory)
        ? [...student.restartHistory[targetIdx].editHistory]
        : [];
      existingEdits.push(editLogItem);
      student.restartHistory[targetIdx] = {
        ...student.restartHistory[targetIdx],
        status: student.isPaused ? 'Paused' : 'Restarted',
        previousScheduleStatus: prevScheduleStatus,
        restartDate: restartDateUtc,
        newBatchId: targetBatchDoc._id.toString(),
        newBatchName: targetBatchDoc.name,
        newTeacherId: resolvedTeacherId || undefined,
        newTeacherName,
        newSchedule: newScheduleInfo,
        completedAtRestart: completedCount,
        remainingAtRestart: remainingCount,
        lastEditedAt: new Date(),
        lastEditedBy: req.user?._id,
        editHistory: existingEdits,
      };
    } else {
      student.restartHistory.push({
        id: `pr_${Date.now()}`,
        status: student.isPaused ? 'Paused' : 'Restarted',
        previousScheduleStatus: prevScheduleStatus,
        pauseDate: student.pauseDate || new Date(),
        reason: student.pauseReason || 'Schedule Reset / Restart',
        restartDate: restartDateUtc,
        restartedBy: req.user?._id,
        previousBatchId: batchId,
        previousBatchName: targetBatchDoc.name || '',
        previousBatchType: '1:1',
        previousTeacherId: oldTeacherId || undefined,
        previousTeacherName: prevTeacherName,
        previousSchedule: editLogItem.previousValues,
        newBatchId: targetBatchDoc._id.toString(),
        newBatchName: targetBatchDoc.name,
        newTeacherId: resolvedTeacherId || undefined,
        newTeacherName,
        newSchedule: newScheduleInfo,
        completedAtRestart: completedCount,
        remainingAtRestart: remainingCount,
        totalClasses: totalSessions,
        archivedSchedules: [],
        editHistory: [editLogItem],
        createdAt: new Date(),
      });
    }

    student.restartDetails = {
      historyEntryId: targetIdx >= 0 ? student.restartHistory[targetIdx].id : student.restartHistory[student.restartHistory.length - 1].id,
      restartDate: restartDateUtc,
      days: normalizedSched.days,
      dayTimings: normalizedSched.dayTimings,
      timing: normalizedSched.timing,
      durationMinutes: normalizedSched.durationMinutes,
      timeMode: normalizedSched.timeMode,
      teacherId: resolvedTeacherId || undefined,
      teacherName: newTeacherName,
      previousScheduleStatus: prevScheduleStatus,
      restartStatus: student.isPaused ? 'Paused' : 'Active',
      updatedAt: new Date(),
    };

    student.lastRestartDate = restartDateUtc;
    student.assignedTutor = resolvedTeacherId || undefined;
    await student.save();

    clearStudentScheduleCaches([oldTeacherId, resolvedTeacherId || '']);

    await student.populate('batch', STUDENT_BATCH_POPULATE_FIELDS);
    await student.populate('pastBatches.batch', 'name subject status assignedTeacher numberOfSessions');
    await student.populate('assignedTutor', 'name email');

    res.status(200).json({
      message: `Restart details updated (${updatedSessionsCount} adjusted, ${createdSessionsCount} added, ${deletedSessionsCount} removed). Completed classes preserved.`,
      student,
      batch: targetBatchDoc,
      completedClasses: completedCount,
      remainingClasses: remainingCount,
      updatedSessionsCount,
      createdSessionsCount,
      deletedSessionsCount,
    });
  } catch (error: any) {
    console.error('Error updating restart details:', error);
    res.status(500).json({ message: 'Failed to update restart details', detail: error.message });
  }
};


