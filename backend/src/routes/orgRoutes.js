import { Router } from 'express';
import { getOrgTree } from '../controllers/orgController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/tree', checkPermission('departments.view'), getOrgTree);

export default router;