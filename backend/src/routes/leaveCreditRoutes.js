import { Router } from 'express';
import {
  getMyBalances, getEmployeeBalancesById, getEmployeeLedger,
  adjust, runMonthlyAccrual, runAnnualAccrual, getSummary,
} from '../controllers/leaveCreditController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Self-service
router.get('/me',
  checkPermission('leave_credits.view'),
  getMyBalances);

// HR/admin summary
router.get('/summary',
  checkPermission('leave_credits.view'),
  getSummary);

// Employee-specific views
router.get('/employee/:employeeId',
  checkPermission('leave_credits.view'),
  getEmployeeBalancesById);

router.get('/employee/:employeeId/ledger',
  checkPermission('leave_credits.view'),
  getEmployeeLedger);

// Manual adjustment
router.post('/adjust',
  checkPermission('leave_credits.adjust'),
  adjust);

// Accrual runs
router.post('/accrue/monthly',
  checkPermission('leave_credits.post_monthly'),
  runMonthlyAccrual);

router.post('/accrue/annual',
  checkPermission('leave_credits.post_monthly'),
  runAnnualAccrual);

export default router;