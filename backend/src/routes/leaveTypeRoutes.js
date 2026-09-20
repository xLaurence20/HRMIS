import { Router } from 'express';
import {
  listLeaveTypes, getLeaveType, createLeaveType,
  updateLeaveType, deleteLeaveType,
} from '../controllers/leaveTypeController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Read: any authenticated user with leave.view (employees need this to file)
router.get('/',    checkPermission('leave.view'), listLeaveTypes);
router.get('/:id', checkPermission('leave.view'), getLeaveType);

// Write: HR/Admin via leave.manage_types (added to seed as leave.view for now —
// Admin has it; HR will get it when we extend the permission seed in 2b)
router.post('/',     checkPermission('settings.manage', 'leave_credits.adjust'), createLeaveType);
router.put('/:id',   checkPermission('settings.manage', 'leave_credits.adjust'), updateLeaveType);
router.delete('/:id', checkPermission('settings.manage', 'leave_credits.adjust'), deleteLeaveType);

export default router;