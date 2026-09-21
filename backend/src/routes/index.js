import { Router } from 'express';
import authRoutes           from './authRoutes.js';
import roleRoutes           from './roleRoutes.js';
import profileRoutes        from './profileRoutes.js';
import departmentRoutes     from './departmentRoutes.js';
import positionRoutes       from './positionRoutes.js';
import employeeRoutes       from './employeeRoutes.js';
import serviceRecordRoutes  from './serviceRecordRoutes.js';
import orgRoutes            from './orgRoutes.js';
import holidayRoutes        from './holidayRoutes.js';
import dtrRoutes            from './dtrRoutes.js';
import attendanceRoutes     from './attendanceRoutes.js';
import leaveTypeRoutes      from './leaveTypeRoutes.js';
import leaveRoutes          from './leaveRoutes.js';
import leaveCreditRoutes    from './leaveCreditRoutes.js';
import auditRoutes          from './auditRoutes.js';
import dashboardRoutes      from './dashboardRoutes.js';
import reportRoutes         from './reportRoutes.js';

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', ts: new Date().toISOString() } }));

router.use('/auth',            authRoutes);
router.use('/roles',           roleRoutes);
router.use('/profile',         profileRoutes);
router.use('/departments',     departmentRoutes);
router.use('/positions',       positionRoutes);
router.use('/employees',       employeeRoutes);
router.use('/service-records', serviceRecordRoutes);
router.use('/org',             orgRoutes);
router.use('/holidays',        holidayRoutes);
router.use('/dtr',             dtrRoutes);
router.use('/attendance',      attendanceRoutes);
router.use('/leave-types',     leaveTypeRoutes);
router.use('/leaves',          leaveRoutes);
router.use('/leave-credits',   leaveCreditRoutes);
router.use('/audit-logs',      auditRoutes);
router.use('/dashboard',       dashboardRoutes);
router.use('/reports',         reportRoutes);

export default router;