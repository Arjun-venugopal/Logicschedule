import express from 'express';
import { getTeachers, createTeacher, updateTeacher, deleteTeacher, getTeacherProfile, updateTeacherProfile, getTeacherPerformance } from '../controllers/teacherController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getTeachers)
  .post(protect, permissionCheck('teachers', 'write'), createTeacher);

router.get('/profile', protect, getTeacherProfile);
router.put('/profile', protect, updateTeacherProfile);
router.get('/:id/performance', protect, getTeacherPerformance);

router.route('/:id')
  .put(protect, permissionCheck('teachers', 'write'), updateTeacher)
  .delete(protect, permissionCheck('teachers', 'write'), deleteTeacher);

export default router;
