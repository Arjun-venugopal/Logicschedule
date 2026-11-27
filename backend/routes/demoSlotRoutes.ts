import express from 'express';
import { getDemoSlots, createDemoSlot, deleteDemoSlot } from '../controllers/demoSlotController';
import { protect, authorizeRoles } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getDemoSlots)
  .post(protect, authorizeRoles('Admin', 'Super Admin', 'Sub Admin', 'Teacher'), createDemoSlot);

router.route('/:id')
  .delete(protect, authorizeRoles('Admin', 'Super Admin', 'Sub Admin', 'Teacher'), deleteDemoSlot);

export default router;
