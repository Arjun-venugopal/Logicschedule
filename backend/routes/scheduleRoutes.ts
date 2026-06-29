import express from 'express';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getSchedulesByStudent } from '../controllers/scheduleController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getSchedules)
  .post(protect, permissionCheck('schedule', 'write'), createSchedule);

router.route('/student/:studentId')
  .get(protect, getSchedulesByStudent);

router.route('/:id')
  .put(protect, updateSchedule)
  .delete(protect, permissionCheck('schedule', 'write'), deleteSchedule);

export default router;
