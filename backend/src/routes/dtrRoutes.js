import { Router } from 'express';
import {
  listPeriods, getPeriod, createPeriod,
  updateLog, updatePeriodStatus, deletePeriod,
  getPrintPayload, uploadCsv, recomputePeriod,
} from '../controllers/dtrController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { csvUpload } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

/* ---- Periods ------------------------------------------------------ */
router.get('/periods',
  checkPermission('dtr.view'),
  listPeriods);

router.get('/periods/:id',
  checkPermission('dtr.view'),
  getPeriod);

router.get('/periods/:id/print',
  checkPermission('dtr.view', 'dtr.print'),
  getPrintPayload);

router.post('/periods',
  checkPermission('dtr.correct', 'dtr.upload'),
  createPeriod);

router.put('/periods/:id/status',
  checkPermission('dtr.verify'),
  updatePeriodStatus);

router.post('/periods/:id/recompute',
  checkPermission('dtr.verify', 'dtr.correct'),
  recomputePeriod);

router.delete('/periods/:id',
  checkPermission('dtr.correct'),
  deletePeriod);

/* ---- Logs --------------------------------------------------------- */
router.put('/logs/:id',
  checkPermission('dtr.correct'),
  updateLog);

/* ---- CSV upload --------------------------------------------------- */
router.post('/upload',
  checkPermission('dtr.upload'),
  csvUpload.single('file'),
  uploadCsv);

export default router;