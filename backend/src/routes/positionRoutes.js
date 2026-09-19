import { Router } from 'express';
import {
  listPositions, getPosition,
  createPosition, updatePosition, deletePosition,
} from '../controllers/positionController.js';
import { authenticate } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/',     checkPermission('positions.view'),   listPositions);
router.get('/:id',  checkPermission('positions.view'),   getPosition);

router.post('/',    checkPermission('positions.manage'), createPosition);
router.put('/:id',  checkPermission('positions.manage'), updatePosition);
router.delete('/:id', checkPermission('positions.manage'), deletePosition);

export default router;