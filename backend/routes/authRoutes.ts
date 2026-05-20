import express from 'express';
import { loginUser, registerUser, createTeacherAccount } from '../controllers/authController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/create-teacher', protect, admin, createTeacherAccount);

export default router;
