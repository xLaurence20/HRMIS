import { Router } from 'express';
import {
  getMyProfile, setupProfile, listDepartments,
} from '../controllers/profileController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/me',      checkPermission('profile.view'),   getMyProfile);
router.put('/setup',   checkPermission('profile.update'), setupProfile);
router.get('/departments', listDepartments);

export default router;