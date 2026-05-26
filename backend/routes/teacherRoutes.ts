import express from 'express';
import { getTeachers, createTeacher, updateTeacher, deleteTeacher, getTeacherProfile, updateTeacherProfile, getTeacherPerformance } from '../controllers/teacherController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getTeachers)
  .post(protect, admin, createTeacher);

router.get('/profile', protect, getTeacherProfile);
router.put('/profile', protect, updateTeacherProfile);
router.get('/:id/performance', protect, getTeacherPerformance);

router.route('/:id')
  .put(protect, admin, updateTeacher)
  .delete(protect, admin, deleteTeacher);

export default router;
