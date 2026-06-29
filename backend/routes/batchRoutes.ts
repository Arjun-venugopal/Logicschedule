import express from 'express';
import { getBatches, createBatch, updateBatch, deleteBatch, getBatchAnalytics } from '../controllers/batchController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getBatches)
  .post(protect, permissionCheck('batches', 'write'), createBatch);

router.route('/:id')
  .put(protect, permissionCheck('batches', 'write'), updateBatch)
  .delete(protect, permissionCheck('batches', 'write'), deleteBatch);

router.get('/:id/analytics', protect, getBatchAnalytics);

export default router;
