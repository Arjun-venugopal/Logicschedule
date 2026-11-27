import express from 'express';
import {
  getBinItems,
  getBinStats,
  getDeletedEmails,
  checkEmailInBin,
  restoreBinItem,
  releaseDeletedEmail,
  deleteBinItemPermanently,
  emptyBin,
} from '../controllers/recycleBinController';
import { protect, admin, authorizeRoles } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect, authorizeRoles('Admin', 'Super Admin', 'Sub Admin'));

router.get('/', getBinItems);
router.get('/stats', getBinStats);
router.get('/emails', getDeletedEmails);
router.get('/check-email', checkEmailInBin);

router.post('/restore/:id', restoreBinItem);
router.post('/release-email/:id', releaseDeletedEmail);

router.delete('/:id', admin, deleteBinItemPermanently);
router.delete('/', admin, emptyBin);

export default router;
