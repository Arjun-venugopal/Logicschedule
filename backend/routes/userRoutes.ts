import express from 'express';
import { getSubAdmins, createSubAdmin, updateSubAdmin, deleteSubAdmin } from '../controllers/userController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/sub-admins')
  .get(protect, admin, getSubAdmins)
  .post(protect, admin, createSubAdmin);

router.route('/sub-admins/:id')
  .put(protect, admin, updateSubAdmin)
  .delete(protect, admin, deleteSubAdmin);

export default router;
