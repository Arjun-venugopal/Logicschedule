import express from 'express';
import { getDemoSessions, createDemoSession, updateDemoSession, deleteDemoSession } from '../controllers/demoSessionController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getDemoSessions)
  .post(protect, admin, createDemoSession);

router.route('/:id')
  .put(protect, updateDemoSession)
  .delete(protect, admin, deleteDemoSession);

export default router;
