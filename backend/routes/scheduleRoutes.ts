import express from 'express';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../controllers/scheduleController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getSchedules)
  .post(protect, admin, createSchedule);

router.route('/:id')
  .put(protect, updateSchedule)
  .delete(protect, admin, deleteSchedule);

export default router;
