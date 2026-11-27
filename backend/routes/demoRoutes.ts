import express from 'express';
import {
  getDemoSessions,
  createDemoSession,
  updateDemoSession,
  deleteDemoSession,
  checkDuplicateDemoSession,
} from '../controllers/demoSessionController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/check-duplicate', protect, permissionCheck('demoSessions', 'write'), checkDuplicateDemoSession);

router.route('/')
  .get(protect, getDemoSessions)
  .post(protect, permissionCheck('demoSessions', 'write'), createDemoSession);

router.route('/:id')
  .put(protect, updateDemoSession)
  .delete(protect, permissionCheck('demoSessions', 'write'), deleteDemoSession);

export default router;

