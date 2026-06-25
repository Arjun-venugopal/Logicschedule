import express from 'express';
import { getDemoSlots, createDemoSlot, deleteDemoSlot } from '../controllers/demoSlotController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getDemoSlots)
  .post(protect, admin, createDemoSlot);

router.route('/:id')
  .delete(protect, admin, deleteDemoSlot);

export default router;
