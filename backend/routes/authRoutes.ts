import express from 'express';
import { loginUser, registerUser, createTeacherAccount, changePassword } from '../controllers/authController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/create-teacher', protect, admin, createTeacherAccount);
router.put('/change-password', protect, changePassword);

export default router;
