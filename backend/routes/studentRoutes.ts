import express from 'express';
import multer from 'multer';
import { uploadStudents, getStudentsByBatch, getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../controllers/studentController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Admin only routes
router.post('/upload', protect, admin, upload.single('file'), uploadStudents);
router.get('/', protect, admin, getAllStudents);
router.post('/', protect, admin, createStudent);
router.get('/:id', protect, admin, getStudentById);
router.put('/:id', protect, admin, updateStudent);
router.delete('/:id', protect, admin, deleteStudent);

// Teacher or Admin can get students for a batch
router.get('/batch/:batchId', protect, getStudentsByBatch);

export default router;
