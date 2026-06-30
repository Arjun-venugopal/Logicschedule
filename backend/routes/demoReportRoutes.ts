import express, { Response, NextFunction } from 'express';
import { getDemoReports, getDemoReportById, getDemoReportBySession, createDemoReport, updateDemoReport, deleteDemoReport } from '../controllers/demoReportController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

const checkReportWriteAccess = (req: any, res: Response, next: NextFunction) => {
  if (['Admin', 'Super Admin', 'Teacher'].includes(req.user.role)) {
    return next();
  }
  if (req.user.role === 'Sub Admin') {
    const hasPerm = req.user.permissions?.demoSessions?.write;
    if (hasPerm) return next();
  }
  return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
};

router.route('/')
  .get(protect, getDemoReports)
  .post(protect, checkReportWriteAccess, createDemoReport);

router.route('/by-session/:sessionId')
  .get(protect, getDemoReportBySession);

router.route('/:id')
  .get(protect, getDemoReportById)
  .put(protect, checkReportWriteAccess, updateDemoReport)
  .delete(protect, checkReportWriteAccess, deleteDemoReport);

export default router;
