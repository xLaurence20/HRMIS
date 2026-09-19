import { Router } from 'express';
import {
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
} from '../controllers/holidayController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Anyone with dtr.view can read the calendar (employees see holidays too)
router.get('/', checkPermission('dtr.view'), listHolidays);

// Manage: gated by an HR-level permission (settings.manage covers admin)
router.post('/',    checkPermission('settings.manage'), createHoliday);
router.put('/:id',  checkPermission('settings.manage'), updateHoliday);
router.delete('/:id', checkPermission('settings.manage'), deleteHoliday);

export default router;