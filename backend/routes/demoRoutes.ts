import express from 'express';
import { getDemoSessions, createDemoSession, updateDemoSession, deleteDemoSession } from '../controllers/demoSessionController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getDemoSessions)
  .post(protect, permissionCheck('demoSessions', 'write'), createDemoSession);

router.route('/:id')
  .put(protect, permissionCheck('demoSessions', 'write'), updateDemoSession)
  .delete(protect, permissionCheck('demoSessions', 'write'), deleteDemoSession);

export default router;
