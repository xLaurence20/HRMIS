import { Router } from 'express';
import {
  listAuditLogs, getAuditLog, getAuditStats, exportAuditLogs,
  listDistinctActions, listDistinctEntityTypes,
} from '../controllers/auditController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);
router.use(checkPermission('audit_logs.view'));

// Static paths must be declared before the ':id' param route
router.get('/stats',          getAuditStats);
router.get('/export',         exportAuditLogs);
router.get('/actions',        listDistinctActions);
router.get('/entity-types',   listDistinctEntityTypes);

router.get('/',               listAuditLogs);
router.get('/:id',            getAuditLog);

export default router;