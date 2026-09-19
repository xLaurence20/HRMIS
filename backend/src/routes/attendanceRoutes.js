import { Router } from 'express';
import {
  listSummaries, getDashboard, listAlerts,
  recomputeSummaries,
  listThresholds, createThreshold, updateThreshold, deleteThreshold,
} from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/* ---- Summaries & dashboards --------------------------------------- */
router.get('/summaries',
  checkPermission('attendance.view'),
  listSummaries);

router.get('/dashboard',
  checkPermission('attendance.monitor', 'attendance.view'),
  getDashboard);

router.get('/alerts',
  checkPermission('attendance.monitor', 'attendance.view'),
  listAlerts);

router.post('/summaries/recompute',
  checkPermission('attendance.monitor', 'dtr.verify'),
  recomputeSummaries);

/* ---- Thresholds --------------------------------------------------- */
router.get('/thresholds',
  checkPermission('attendance.view'),
  listThresholds);

router.post('/thresholds',
  checkPermission('attendance.configure_alerts'),
  createThreshold);

router.put('/thresholds/:id',
  checkPermission('attendance.configure_alerts'),
  updateThreshold);

router.delete('/thresholds/:id',
  checkPermission('attendance.configure_alerts'),
  deleteThreshold);

export default router;