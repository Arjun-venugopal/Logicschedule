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
// We allow Admin/Super Admin, Sub Admin, or Sales Person to fetch list of sales people (for dropdowns)
router.get('/', (req: any, res, next) => {
  if (req.user && (req.user.role === 'Sales Person' || req.user.role === 'Sub Admin' || req.user.role === 'Admin' || req.user.role === 'Super Admin')) {
    next();
  } else {
    permissionCheck('salesPeople', 'read')(req, res, next);
  }
}, getSalesPeople);
router.post('/', permissionCheck('salesPeople', 'write'), createSalesPerson);
router.put('/:id', permissionCheck('salesPeople', 'write'), updateSalesPerson);
router.delete('/:id', permissionCheck('salesPeople', 'write'), deleteSalesPerson);

export default router;
