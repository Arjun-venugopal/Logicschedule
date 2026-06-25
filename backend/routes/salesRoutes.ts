import express from 'express';
import { protect, permissionCheck } from '../middleware/authMiddleware';
import {
  getSalesPeople,
  createSalesPerson,
  updateSalesPerson,
  deleteSalesPerson
} from '../controllers/salesController';

const router = express.Router();

router.use(protect);
// We allow either Admin/Super Admin or Sub Admin with salesPeople read/write permissions
router.get('/', permissionCheck('salesPeople', 'read'), getSalesPeople);
router.post('/', permissionCheck('salesPeople', 'write'), createSalesPerson);
router.put('/:id', permissionCheck('salesPeople', 'write'), updateSalesPerson);
router.delete('/:id', permissionCheck('salesPeople', 'write'), deleteSalesPerson);

export default router;
