import express from 'express';
import multer from 'multer';
import { 
  uploadStudents, 
  getStudentsByBatch, 
  getAllStudents, 
  getStudentById, 
  createStudent, 
  updateStudent, 
  advanceStudentLevel, 
  deleteStudent,
  submitProjectSubmission,
  deleteProjectSubmission,
} from '../controllers/studentController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Admin / Sub-admin / Teacher accessible routes
router.post('/upload', protect, permissionCheck('students', 'write'), upload.single('file'), uploadStudents);
router.get('/', protect, getAllStudents);
router.post('/', protect, permissionCheck('students', 'write'), createStudent);
router.get('/:id', protect, getStudentById);
router.put('/:id', protect, permissionCheck('students', 'write'), updateStudent);
router.post('/:id/advance-level', protect, permissionCheck('students', 'write'), advanceStudentLevel);
router.delete('/:id', protect, permissionCheck('students', 'write'), deleteStudent);

// Project Link Submission by Teacher or Admin
router.put('/:id/project-submission', protect, submitProjectSubmission);
router.delete('/:id/project-submission', protect, deleteProjectSubmission);

// Teacher or Admin can get students for a batch
router.get('/batch/:batchId', protect, getStudentsByBatch);

export default router;

