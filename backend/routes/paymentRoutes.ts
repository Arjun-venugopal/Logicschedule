import express from 'express';
import {
  createAdmissionPayment,
  recordPayment,
  getPayments,
  getSinglePayment,
  updatePayment,
  deletePayment,
  getStudentPayment,
  getPaymentNotifications,
  getConfig,
  updateConfig,
} from '../controllers/paymentController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

// Notification endpoint (available to all logged in staff)
router.get('/notifications', protect, getPaymentNotifications);

// Rules configuration
router.get('/config', protect, getConfig);
router.put('/config', protect, admin, updateConfig);

// Student payment summary
router.get('/student/:studentId', protect, getStudentPayment);

// Record initial admission / direct payment
router.post('/admission', protect, createAdmissionPayment);

// Record follow-up installment / balance payment
router.post('/record', protect, recordPayment);

// List all payments with analytics & create direct fee record
router.route('/')
  .get(protect, getPayments)
  .post(protect, createAdmissionPayment);

// Single payment CRUD operations
router.route('/:id')
  .get(protect, getSinglePayment)
  .put(protect, admin, updatePayment)
  .delete(protect, admin, deletePayment);

export default router;
