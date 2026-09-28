import express from 'express';
import {
  loginUser,
  registerUser,
  refreshTokenHandler,
  logoutUser,
  verifyEmail,
  forgotPassword,
  resetPassword,
  createTeacherAccount,
  changePassword,
} from '../controllers/authController';
import { protect, permissionCheck } from '../middleware/authMiddleware';
import { authLimiter, passwordResetLimiter } from '../middleware/authRateLimiters';

const router = express.Router();

// Public authentication & session endpoints with rate limiting
router.post('/login', authLimiter, loginUser);
router.post('/register', authLimiter, registerUser);
router.post('/refresh', refreshTokenHandler);
router.post('/logout', logoutUser);

// Email verification endpoints
router.post('/verify-email', verifyEmail);
router.get('/verify-email', verifyEmail);

// Password recovery & reset endpoints with strict rate limiting
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Protected account management endpoints
router.post('/create-teacher', protect, permissionCheck('teachers', 'write'), createTeacherAccount);
router.put('/change-password', protect, changePassword);

export default router;
