import express from 'express';
import { loginUser, registerUser, createTeacherAccount, changePassword } from '../controllers/authController';
import { protect, permissionCheck } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/create-teacher', protect, permissionCheck('teachers', 'write'), createTeacherAccount);
router.put('/change-password', protect, changePassword);

export default router;
