import { Router } from 'express';
import {
  getExecutiveDashboard, getMySummary,
} from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Employee self-summary — any authenticated user
router.get('/my-summary', getMySummary);

// Executive dashboard — restricted
router.get('/executive',
  checkPermission('reports.executive_dashboard', 'reports.view'),
  getExecutiveDashboard);

export default router;