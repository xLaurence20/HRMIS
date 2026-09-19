import { Router } from 'express';
import {
  listRoles, getRole, updateRolePermissions, listPermissions,
} from '../controllers/roleController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

// Everything below requires a valid session.
router.use(authenticate);

// Static path must be declared before the ':roleId' param route.
router.get('/permissions/catalogue',
  checkPermission('roles.view'),
  listPermissions);

router.get('/',
  checkPermission('roles.view'),
  listRoles);

router.get('/:roleId',
  checkPermission('roles.view'),
  getRole);

router.put('/:roleId/permissions',
  checkPermission('roles.manage_permissions'),
  updateRolePermissions);

// Alias matching the literal spec wording.
router.post('/permissions',
  checkPermission('roles.manage_permissions'),
  (req, _res, next) => { req.params.roleId = req.body?.roleId; next(); },
  updateRolePermissions);

export default router;