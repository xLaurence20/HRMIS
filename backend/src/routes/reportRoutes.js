import { Router } from 'express';
import {
  listReportDefinitions, getReportDefinition,
  runReport, exportReportCsv,
  listReportRuns, getReportRun,
} from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/* ---------------------------------------------------------------- *
 *  Report definitions — any authenticated user can see what they
 *  have access to (definitions are filtered by permission server-side)
 * ---------------------------------------------------------------- */
router.get('/definitions',
  checkPermission('reports.view'),
  listReportDefinitions);

router.get('/definitions/:id',
  checkPermission('reports.view'),
  getReportDefinition);

/* ---------------------------------------------------------------- *
 *  Execution — permissions enforced per-report by the controller
 *  (each definition declares its own required_permission)
 * ---------------------------------------------------------------- */
router.post('/:id/run',
  checkPermission('reports.view'),
  runReport);

router.post('/:id/export/csv',
  checkPermission('reports.view'),
  exportReportCsv);

/* ---------------------------------------------------------------- *
 *  Run history
 * ---------------------------------------------------------------- */
router.get('/runs',
  checkPermission('reports.view'),
  listReportRuns);

router.get('/runs/:id',
  checkPermission('reports.view'),
  getReportRun);

export default router;