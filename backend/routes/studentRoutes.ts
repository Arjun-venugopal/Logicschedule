import express from 'express';
import multer from 'multer';
import { uploadStudents, getStudentsByBatch, getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../controllers/studentController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Admin only routes
router.post('/upload', protect, permissionCheck('students', 'write'), upload.single('file'), uploadStudents);
router.get('/', protect, getAllStudents);
router.post('/', protect, permissionCheck('students', 'write'), createStudent);
router.get('/:id', protect, permissionCheck('students', 'read'), getStudentById);
router.put('/:id', protect, permissionCheck('students', 'write'), updateStudent);
router.delete('/:id', protect, permissionCheck('students', 'write'), deleteStudent);

// Teacher or Admin can get students for a batch
router.get('/batch/:batchId', protect, getStudentsByBatch);

export default router;
