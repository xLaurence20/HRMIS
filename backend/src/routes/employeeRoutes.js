import { Router } from 'express';
import {
  listEmployees, getEmployee,
  createEmployee, updateEmployee, deleteEmployee,
  linkUserAccount, unlinkUserAccount,
  listSupervisorCandidates,
} from '../controllers/employeeController.js';
import {
  listForEmployee, createServiceRecord,
} from '../controllers/serviceRecordController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Static path must come before the ':id' param route
router.get('/lookups/supervisors',
  checkPermission('employees.view'),
  listSupervisorCandidates);

router.get('/',       checkPermission('employees.view'),   listEmployees);
router.get('/:id',    checkPermission('employees.view'),   getEmployee);

router.post('/',      checkPermission('employees.create'), createEmployee);
router.put('/:id',    checkPermission('employees.update'), updateEmployee);
router.delete('/:id', checkPermission('employees.delete'), deleteEmployee);

router.post('/:id/link-user',
  checkPermission('users.assign_roles'),
  linkUserAccount);
router.delete('/:id/link-user',
  checkPermission('users.assign_roles'),
  unlinkUserAccount);

// ---- Service records (nested resource) -------------------------------
router.get('/:employeeId/service-records',
  checkPermission('service_records.view'),
  listForEmployee);
router.post('/:employeeId/service-records',
  checkPermission('service_records.create'),
  createServiceRecord);

export default router;