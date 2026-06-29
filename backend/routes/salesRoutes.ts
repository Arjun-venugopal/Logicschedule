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
// We allow either Admin/Super Admin, Sub Admin with salesPeople read permissions, OR Sales Person (for dropdowns)
router.get('/', (req, res, next) => {
  if (req.user && req.user.role === 'Sales Person') {
    next();
  } else {
    permissionCheck('salesPeople', 'read')(req, res, next);
  }
}, getSalesPeople);
router.post('/', permissionCheck('salesPeople', 'write'), createSalesPerson);
router.put('/:id', permissionCheck('salesPeople', 'write'), updateSalesPerson);
router.delete('/:id', permissionCheck('salesPeople', 'write'), deleteSalesPerson);

export default router;
