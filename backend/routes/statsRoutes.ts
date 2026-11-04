import express from 'express';
import {
  getDashboardStats,
  getMemoryMetrics,
  clearCache,
  pruneCache,
  updateCacheConfig,
  runMemoryOptimization,
  runSystemAudit,
} from '../controllers/statsController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getDashboardStats);
router.get('/memory', protect, admin, getMemoryMetrics);
router.get('/audit', protect, admin, runSystemAudit);
router.post('/memory/gc', protect, admin, runMemoryOptimization);
router.post('/cache/clear', protect, admin, clearCache);
router.post('/cache/prune', protect, admin, pruneCache);
router.put('/cache/config', protect, admin, updateCacheConfig);

export default router;
