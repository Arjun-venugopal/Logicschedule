import express from 'express';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getSchedulesByStudent } from '../controllers/scheduleController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getSchedules)
  .post(protect, (req: any, res: any, next: any) => {
    // Teachers can create regular or extra classes for their batches; otherwise require schedule:write
    if (req.user?.role === 'Teacher') {
      return next();
    }
    return permissionCheck('schedule', 'write')(req, res, next);
  }, createSchedule);

router.route('/student/:studentId')
  .get(protect, getSchedulesByStudent);

router.route('/:id')
  .put(protect, updateSchedule)
  .delete(protect, permissionCheck('schedule', 'write'), deleteSchedule);

export default router;
