import { Router } from 'express';
import {
  login, refresh, logout, me, myPermissions, changePassword,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter, refreshLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/login',           loginLimiter, login);
router.post('/refresh',         refreshLimiter, refresh);
router.post('/logout',          logout);
router.get('/me',               authenticate, me);
router.get('/permissions',      authenticate, myPermissions);
router.post('/change-password', authenticate, changePassword);

export default router;