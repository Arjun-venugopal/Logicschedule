import express from 'express';
import {
  getDashboardStats,
  getMemoryMetrics,
  clearCache,
  pruneCache,
  updateCacheConfig,
} from '../controllers/statsController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getDashboardStats);
router.get('/memory', protect, admin, getMemoryMetrics);
router.post('/cache/clear', protect, admin, clearCache);
router.post('/cache/prune', protect, admin, pruneCache);
router.put('/cache/config', protect, admin, updateCacheConfig);

export default router;
