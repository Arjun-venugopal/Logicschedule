import express from 'express';
import {
  createAdmissionPayment,
  recordPayment,
  getPayments,
  getSinglePayment,
  updatePayment,
  deletePayment,
  getStudentPayment,
  getDemoSessionPayment,
  getPaymentNotifications,
  getConfig,
  updateConfig,
} from '../controllers/paymentController';
import { protect, admin, authorizeRoles } from '../middleware/authMiddleware';

const router = express.Router();

const requirePaymentAccess = (accessType: 'read' | 'write') => {
  return (req: any, res: any, next: any) => {
    const role = req.user?.role;
    if (role === 'Admin' || role === 'Super Admin' || role === 'Sales Person') {
      next();
      return;
    }
    if (role === 'Sub Admin') {
      const perms = req.user?.permissions || {};
      const allowed = perms.payments?.[accessType] === true || (accessType === 'read' && perms.demoSessions?.read === true);
      if (allowed) {
        next();
        return;
      }
    }
    res.status(403).json({ message: 'Forbidden: Insufficient payment permissions' });
  };
};

// Notification endpoint (restricted to authorized non-teacher staff)
router.get('/notifications', protect, authorizeRoles('Admin', 'Super Admin', 'Sub Admin', 'Sales Person'), requirePaymentAccess('read'), getPaymentNotifications);

// Rules configuration
router.get('/config', protect, requirePaymentAccess('read'), getConfig);
router.put('/config', protect, admin, updateConfig);

// Student payment summary
router.get('/student/:studentId', protect, requirePaymentAccess('read'), getStudentPayment);

// Demo session payment summary
router.get('/demo-session/:sessionId', protect, requirePaymentAccess('read'), getDemoSessionPayment);

// Record initial admission / direct payment
router.post('/admission', protect, requirePaymentAccess('write'), createAdmissionPayment);

// Record follow-up installment / balance payment
router.post('/record', protect, requirePaymentAccess('write'), recordPayment);

// List all payments with analytics & create direct fee record
router.route('/')
  .get(protect, requirePaymentAccess('read'), getPayments)
  .post(protect, requirePaymentAccess('write'), createAdmissionPayment);

// Single payment CRUD operations
router.route('/:id')
  .get(protect, requirePaymentAccess('read'), getSinglePayment)
  .put(protect, admin, updatePayment)
  .delete(protect, admin, deletePayment);

export default router;
