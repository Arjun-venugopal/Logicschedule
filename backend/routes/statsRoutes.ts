import express from 'express';
import { getDashboardStats } from '../controllers/statsController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getDashboardStats);

export default router;
