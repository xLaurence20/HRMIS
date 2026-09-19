import { Router } from 'express';
import {
  listDepartments, getDepartmentTree, getDepartment,
  createDepartment, updateDepartment, deleteDepartment, setDepartmentHead,
} from '../controllers/departmentController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/',      checkPermission('departments.view'),   listDepartments);
router.get('/tree',  checkPermission('departments.view'),   getDepartmentTree);
router.get('/:id',   checkPermission('departments.view'),   getDepartment);

router.post('/',     checkPermission('departments.manage'), createDepartment);
router.put('/:id',   checkPermission('departments.manage'), updateDepartment);
router.delete('/:id', checkPermission('departments.manage'), deleteDepartment);
router.put('/:id/head', checkPermission('departments.manage'), setDepartmentHead);

export default router;