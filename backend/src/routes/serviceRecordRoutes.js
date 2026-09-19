import { Router } from 'express';
import {
  updateServiceRecord, deleteServiceRecord,
} from '../controllers/serviceRecordController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.put('/:id',    checkPermission('service_records.update'), updateServiceRecord);
router.delete('/:id', checkPermission('service_records.delete'), deleteServiceRecord);

export default router;