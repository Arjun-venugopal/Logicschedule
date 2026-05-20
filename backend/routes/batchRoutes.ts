import express from 'express';
import { getBatches, createBatch, updateBatch, deleteBatch, getBatchAnalytics } from '../controllers/batchController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getBatches)
  .post(protect, admin, createBatch);

router.route('/:id')
  .put(protect, admin, updateBatch)
  .delete(protect, admin, deleteBatch);

router.get('/:id/analytics', protect, getBatchAnalytics);

export default router;
