import { Router } from 'express';
import {
  listApplications, getApplication, getMyApplications, getInbox,
  createApplication, reviewApplication, approveApplication, cancelApplication,
} from '../controllers/leaveApplicationController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Employee self-service — must come before ':id' route
router.get('/my',
  checkPermission('leave.view'),
  getMyApplications);

router.get('/inbox',
  checkPermission('leave.review', 'leave.approve'),
  getInbox);

// HR/admin list
router.get('/',
  checkPermission('leave.view'),
  listApplications);

router.get('/:id',
  checkPermission('leave.view'),
  getApplication);

// Filing
router.post('/',
  checkPermission('leave.apply'),
  createApplication);

// Workflow actions
router.post('/:id/review',
  checkPermission('leave.review'),
  reviewApplication);

router.post('/:id/approve',
  checkPermission('leave.approve'),
  approveApplication);

// Cancellation — any authenticated user can attempt; controller enforces ownership
router.post('/:id/cancel',
  checkPermission('leave.view'),
  cancelApplication);

export default router;