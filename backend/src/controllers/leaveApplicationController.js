import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination, parseSort } from '../utils/validate.js';
import { computeLeaveDays, loadHolidaySet, enumerateDays } from '../utils/leaveDates.js';
import { creditLeaveApplication, reverseCreditForApplication, getBalance } from '../services/leaveCreditService.js';

const SORTABLE = ['filed_at', 'start_date', 'end_date', 'status', 'application_number'];
const STATUSES = ['draft', 'pending_supervisor', 'pending_approver', 'approved', 'rejected', 'cancelled'];

/* ------------------------------------------------------------------ *
 *  Mapper — matches v_leave_applications_full columns
 * ------------------------------------------------------------------ */
const mapApplication = (row) => ({
  id: row.id,
  applicationNumber: row.application_number,
  employeeId: row.employee_id,
  employeeNumber: row.employee_number,
  employeeName: row.employee_name,
  departmentId: row.department_id,
  departmentCode: row.department_code,
  departmentName: row.department_name,
  positionTitle: row.position_title,

  leaveTypeId: row.leave_type_id,
  leaveTypeCode: row.leave_type_code,
  leaveTypeName: row.leave_type_name,
  leaveTypeColor: row.leave_type_color,
  leaveTypeIsCredited: Boolean(row.leave_type_is_credited),
  leaveTypeRequiresAttachment: Boolean(row.leave_type_requires_attachment),

  startDate: row.start_date,
  endDate: row.end_date,
  startHalf: row.start_half,
  endHalf: row.end_half,
  totalDays: Number(row.total_days),
  isWithPay: Boolean(row.is_with_pay),
  reason: row.reason,
  attachmentPath: row.attachment_path,
  contactAddress: row.contact_address,
  contactPhone: row.contact_phone,

  status: row.status,
  supervisorId: row.supervisor_id,
  supervisorName: row.supervisor_name,
  approverId: row.approver_id,
  approverUsername: row.approver_username,

  filedAt: row.filed_at,
  filedByUserId: row.filed_by_user_id,
  filedByUsername: row.filed_by_username,
  supervisorActionAt: row.supervisor_action_at,
  approverActionAt: row.approver_action_at,
  approvedAt: row.approved_at,
  rejectedAt: row.rejected_at,
  creditCommitted: Boolean(row.credit_committed),
  creditCommittedAt: row.credit_committed_at,
  creditDaysDeducted: row.credit_days_deducted !== null ? Number(row.credit_days_deducted) : null,
  cancelledAt: row.cancelled_at,
  cancelledReason: row.cancelled_reason,

  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ------------------------------------------------------------------ *
 *  Application number generator — safe under concurrency
 *  Must be called inside a transaction.
 * ------------------------------------------------------------------ */
async function nextApplicationNumber(conn, year) {
  await conn.query(
    `INSERT INTO leave_application_number_seq (year, last_number)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE year = year`,
    [year]
  );
  // Lock the row for the remainder of the transaction
  const [rows] = await conn.query(
    'SELECT last_number FROM leave_application_number_seq WHERE year = ? FOR UPDATE',
    [year]
  );
  const next = Number(rows[0].last_number) + 1;
  await conn.query(
    'UPDATE leave_application_number_seq SET last_number = ? WHERE year = ?',
    [next, year]
  );
  return `LV-${year}-${String(next).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 *  Validate a proposed application against its leave type rules.
 *  Called from createApplication inside a transaction.
 * ------------------------------------------------------------------ */
async function validateApplication({
  conn, employee, leaveType, startDate, endDate,
  startHalf, endHalf, reason, attachmentPath, skipBalanceCheck = false,
}) {
  // 1. Date order
  if (endDate < startDate) {
    throw new AppError('End date must be on or after start date.', 400, 'VALIDATION_ERROR', {
      fields: [{ field: 'endDate', message: 'Must be on or after start date.' }],
    });
  }

  // 2. Half-day consistency
  const single = startDate === endDate;
  if (startHalf && endHalf && !single) {
    throw new AppError('Only a single-day leave can have both AM and PM halves.',
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'startHalf', message: 'Clear AM or PM for multi-day leaves.' }],
      });
  }
  if (!leaveType.allows_half_day && (startHalf || endHalf)) {
    throw new AppError(`${leaveType.code} does not allow half-day filings.`,
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'startHalf', message: 'Not permitted for this leave type.' }],
      });
  }

  // 3. Gender restriction
  if (leaveType.gender_restriction && employee.gender !== leaveType.gender_restriction) {
    throw new AppError(`${leaveType.code} is restricted to ${leaveType.gender_restriction} employees.`,
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'leaveTypeId', message: `Restricted to ${leaveType.gender_restriction}.` }],
      });
  }

  // 4. Min notice
  if (leaveType.min_notice_days > 0) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    const daysNotice = Math.floor((start - today) / 86400000);
    if (daysNotice < leaveType.min_notice_days) {
      throw new AppError(
        `${leaveType.code} requires at least ${leaveType.min_notice_days} day(s) advance notice.`,
        400, 'VALIDATION_ERROR', {
          fields: [{ field: 'startDate',
            message: `Must be filed at least ${leaveType.min_notice_days} day(s) before start.` }],
        }
      );
    }
  }

  // 5. Attachment requirement
  if (leaveType.requires_attachment && !attachmentPath) {
    throw new AppError(`${leaveType.code} requires an attachment.`,
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'attachmentPath',
          message: leaveType.attachment_hint || 'Required for this leave type.' }],
      });
  }

  // 6. Compute working days (excludes weekends and holidays)
  const holidaySet = await loadHolidaySet(conn, startDate, endDate);
  const totalDays = computeLeaveDays({
    startDate, endDate, startHalf, endHalf, holidaySet,
  });

  if (totalDays <= 0) {
    throw new AppError('The selected range contains no working days.',
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'startDate', message: 'Range falls entirely on weekends/holidays.' }],
      });
  }

  // 7. Max days per request
  if (leaveType.max_days_per_request !== null
      && totalDays > Number(leaveType.max_days_per_request)) {
    throw new AppError(
      `${leaveType.code} allows at most ${leaveType.max_days_per_request} day(s) per filing.`,
      400, 'VALIDATION_ERROR', {
        fields: [{ field: 'totalDays',
          message: `Exceeds limit of ${leaveType.max_days_per_request} day(s).` }],
      }
    );
  }

  // 8. Max days per year
  if (leaveType.max_days_per_year !== null) {
    const year = new Date(startDate).getFullYear();
    const [used] = await conn.query(
      `SELECT COALESCE(SUM(total_days), 0) AS used
         FROM leave_applications
        WHERE employee_id = ? AND leave_type_id = ?
          AND status IN ('pending_supervisor','pending_approver','approved')
          AND deleted_at IS NULL
          AND YEAR(start_date) = ?`,
      [employee.id, leaveType.id, year]
    );
    const usedDays = Number(used[0].used);
    if (usedDays + totalDays > Number(leaveType.max_days_per_year)) {
      throw new AppError(
        `${leaveType.code} annual limit exceeded. Used: ${usedDays.toFixed(2)}, ` +
        `requested: ${totalDays.toFixed(2)}, limit: ${leaveType.max_days_per_year}.`,
        409, 'ANNUAL_LIMIT_EXCEEDED', {
          usedDays, requested: totalDays, limit: Number(leaveType.max_days_per_year),
        }
      );
    }
  }

  // 9. Balance check (for credited types, unless negative allowed)
  if (leaveType.is_credited && !leaveType.allows_negative_balance && !skipBalanceCheck) {
    const bal = await getBalance(employee.id, leaveType.id, conn);
    if (bal.balance < totalDays) {
      // Allow if some of the days are within the same pay period and pending accrual is expected?
      // For Phase 4 we keep it strict.
      throw new AppError(
        `Insufficient ${leaveType.code} balance. Available: ${bal.balance.toFixed(3)} day(s), ` +
        `required: ${totalDays.toFixed(2)} day(s).`,
        409, 'INSUFFICIENT_CREDITS', {
          leaveTypeCode: leaveType.code,
          available: bal.balance,
          required: totalDays,
        }
      );
    }
  }

  return { totalDays };
}

/* ================================================================== *
 *  GET /api/leaves
 *  HR/admin list with filters + pagination
 * ================================================================== */
export const listApplications = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  const orderBy = parseSort(req.query, SORTABLE, 'filed_at DESC');

  const where = ['la.deleted_at IS NULL'];
  const params = [];

  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) {
      throw new AppError('Invalid status filter.', 400, 'VALIDATION_ERROR');
    }
    where.push('la.status = ?');
    params.push(req.query.status);
  }
  if (req.query.employeeId) {
    where.push('la.employee_id = ?');
    params.push(Number(req.query.employeeId));
  }
  if (req.query.leaveTypeId) {
    where.push('la.leave_type_id = ?');
    params.push(Number(req.query.leaveTypeId));
  }
  if (req.query.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.fromDate) {
    where.push('la.start_date >= ?');
    params.push(req.query.fromDate);
  }
  if (req.query.toDate) {
    where.push('la.end_date <= ?');
    params.push(req.query.toDate);
  }
  if (req.query.search) {
    const q = `%${req.query.search.trim()}%`;
    where.push('(la.application_number LIKE ? OR e.full_name LIKE ? OR e.employee_number LIKE ?)');
    params.push(q, q, q);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM leave_applications la
       JOIN employees e ON e.id = la.employee_id
       ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT * FROM v_leave_applications_full
     ${whereSql.replace('WHERE', 'WHERE')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    applications: rows.map(mapApplication),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/leaves/:id
 * ================================================================== */
export const getApplication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT * FROM v_leave_applications_full WHERE id = ?',
    [id]
  );
  if (!rows[0]) throw new AppError('Application not found.', 404, 'NOT_FOUND');

  const [actions] = await pool.query(
    `SELECT a.*, u.username AS actor_username, e.full_name AS actor_full_name
       FROM leave_application_actions a
       LEFT JOIN users u     ON u.id = a.actor_user_id
       LEFT JOIN employees e ON e.user_id = u.id
      WHERE a.application_id = ?
      ORDER BY a.acted_at ASC, a.id ASC`,
    [id]
  );

  // Also fetch day-by-day breakdown so the UI can preview / print
  const holidaySet = await loadHolidaySet(
    pool, rows[0].start_date, rows[0].end_date
  );
  const days = enumerateDays(rows[0].start_date, rows[0].end_date, holidaySet);

  return ok(res, {
    application: mapApplication(rows[0]),
    actions: actions.map((a) => ({
      id: a.id,
      actorUserId: a.actor_user_id,
      actorUsername: a.actor_username,
      actorFullName: a.actor_full_name,
      actorRoleCode: a.actor_role_code,
      actorStage: a.actor_stage,
      action: a.action,
      remarks: a.remarks,
      previousStatus: a.previous_status,
      newStatus: a.new_status,
      actedAt: a.acted_at,
    })),
    days,
  });
});

/* ================================================================== *
 *  GET /api/leaves/my
 *  Employee's own applications. Uses req.user's linked employee.
 * ================================================================== */
export const getMyApplications = asyncHandler(async (req, res) => {
  const [emp] = await pool.query(
    'SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.id]
  );
  if (!emp[0]) throw new AppError('No employee record linked to your account.',
    404, 'NO_EMPLOYEE_LINK');

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  const where = ['employee_id = ?'];
  const params = [emp[0].id];

  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM v_leave_applications_full ${whereSql}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT * FROM v_leave_applications_full
     ${whereSql}
     ORDER BY filed_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    employeeId: emp[0].id,
    applications: rows.map(mapApplication),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/leaves/inbox
 *  Returns applications the current user can act on.
 *  - pending_supervisor requires 'leave.review'
 *  - pending_approver   requires 'leave.approve'
 * ================================================================== */
export const getInbox = asyncHandler(async (req, res) => {
  const perms = req.permissions ?? new Set();
  const canReview = perms.has('leave.review');
  const canApprove = perms.has('leave.approve');

  if (!canReview && !canApprove) {
    return ok(res, { supervisorQueue: [], approverQueue: [], counts: { supervisor: 0, approver: 0 } });
  }

  const supervisorQueue = canReview
    ? (await pool.query(
        `SELECT * FROM v_leave_applications_full
          WHERE status = 'pending_supervisor'
          ORDER BY filed_at ASC
          LIMIT 200`
      ))[0].map(mapApplication)
    : [];

  const approverQueue = canApprove
    ? (await pool.query(
        `SELECT * FROM v_leave_applications_full
          WHERE status = 'pending_approver'
          ORDER BY filed_at ASC
          LIMIT 200`
      ))[0].map(mapApplication)
    : [];

  return ok(res, {
    supervisorQueue,
    approverQueue,
    counts: {
      supervisor: supervisorQueue.length,
      approver: approverQueue.length,
      total: supervisorQueue.length + approverQueue.length,
    },
  });
});

/* ================================================================== *
 *  POST /api/leaves
 *  File a new leave application. Auto-submits (no draft state).
 * ================================================================== */
export const createApplication = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'leaveTypeId', type: 'int', required: true, min: 1 },
    { name: 'startDate',   type: 'date', required: true },
    { name: 'endDate',     type: 'date', required: true },
    { name: 'startHalf',   type: 'enum', enum: ['AM', 'PM'], nullable: true },
    { name: 'endHalf',     type: 'enum', enum: ['AM', 'PM'], nullable: true },
    { name: 'reason',      type: 'string', min: 5, max: 2000 },
    { name: 'attachmentPath', type: 'string', max: 255, nullable: true },
    { name: 'contactAddress', type: 'string', max: 255, nullable: true },
    { name: 'contactPhone',   type: 'string', max: 30, nullable: true },
    // HR/admin can file on behalf of another employee
    { name: 'employeeId', type: 'int', min: 1, nullable: true },
  ]);

  // Determine whose application this is
  let employeeId = body.employeeId ?? null;
  let filedByUserId = null;

  if (!employeeId) {
    const [emp] = await pool.query(
      'SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    );
    if (!emp[0]) throw new AppError('No employee record linked to your account.',
      404, 'NO_EMPLOYEE_LINK');
    employeeId = emp[0].id;
  } else {
    // Filing on behalf of someone else requires HR-level permission
    const perms = req.permissions ?? new Set();
    if (!perms.has('leave.apply') || !perms.has('employees.update')) {
      throw new AppError('You do not have permission to file on behalf of others.',
        403, 'FORBIDDEN');
    }
    filedByUserId = req.user.id;
  }

  const result = await withTransaction(async (conn) => {
    // Load employee + leave type
    const [[employee]] = await conn.query(
      `SELECT id, gender, department_id, supervisor_id, full_name, employee_number
         FROM employees
        WHERE id = ? AND deleted_at IS NULL AND is_active = 1`,
      [employeeId]
    );
    if (!employee) throw new AppError('Employee not found or inactive.', 404, 'NOT_FOUND');

    const [[leaveType]] = await conn.query(
      'SELECT * FROM leave_types WHERE id = ? AND deleted_at IS NULL AND is_active = 1',
      [body.leaveTypeId]
    );
    if (!leaveType) throw new AppError('Leave type not found or inactive.', 404, 'NOT_FOUND');

    const { totalDays } = await validateApplication({
      conn, employee, leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      startHalf: body.startHalf ?? null,
      endHalf: body.endHalf ?? null,
      reason: body.reason,
      attachmentPath: body.attachmentPath ?? null,
    });

    // Resolve approver: any user with APPROVER role gets first pick
    // (single approver model for Phase 4). NULL means "any approver".
    const [[approver]] = await conn.query(
      `SELECT u.id
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'APPROVER' AND u.status = 'active' AND u.deleted_at IS NULL
        ORDER BY u.id ASC LIMIT 1`
    );

    // Generate number + insert
    const year = new Date(body.startDate).getFullYear();
    const applicationNumber = await nextApplicationNumber(conn, year);

    const initialStatus = employee.supervisor_id ? 'pending_supervisor' : 'pending_approver';

    const [ins] = await conn.query(
      `INSERT INTO leave_applications
         (application_number, employee_id, leave_type_id,
          filed_at, filed_by_user_id,
          start_date, end_date, start_half, end_half, total_days,
          is_with_pay, reason, attachment_path, contact_address, contact_phone,
          status, supervisor_id, approver_id,
          created_by, updated_by)
       VALUES (?, ?, ?,
               NOW(), ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?)`,
      [
        applicationNumber, employee.id, leaveType.id,
        filedByUserId,
        body.startDate, body.endDate, body.startHalf ?? null, body.endHalf ?? null, totalDays,
        leaveType.is_paid ? 1 : 0,
        body.reason ?? null, body.attachmentPath ?? null,
        body.contactAddress ?? null, body.contactPhone ?? null,
        initialStatus,
        employee.supervisor_id ?? null,
        approver?.id ?? null,
        req.user.id, req.user.id,
      ]
    );
    const appId = ins.insertId;

    // Audit trail
    await conn.query(
      `INSERT INTO leave_application_actions
         (application_id, actor_user_id, actor_role_code, actor_stage,
          action, remarks, previous_status, new_status)
       VALUES (?, ?, ?, 'filed', 'filed', ?, NULL, ?)`,
      [appId, req.user.id, req.user.roleCode,
       filedByUserId
         ? `Filed on behalf of ${employee.full_name} (${employee.employee_number}).`
         : 'Submitted by employee.',
       initialStatus]
    );

    return { appId, applicationNumber, initialStatus };
  });

  const [rows] = await pool.query(
    'SELECT * FROM v_leave_applications_full WHERE id = ?',
    [result.appId]
  );

  return ok(res, {
    application: mapApplication(rows[0]),
    message: result.initialStatus === 'pending_supervisor'
      ? 'Filed. Awaiting supervisor review.'
      : 'Filed. Awaiting final approval.',
  }, 201);
});

/* ================================================================== *
 *  POST /api/leaves/:id/review
 *  Supervisor stage action: recommend (advance) or reject.
 *  Body: { action: 'recommend'|'reject', remarks?: string }
 * ================================================================== */
export const reviewApplication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'action', type: 'enum', required: true, enum: ['recommend', 'reject'] },
    { name: 'remarks', type: 'string', max: 500, nullable: true },
  ]);

  await withTransaction(async (conn) => {
    const [[app]] = await conn.query(
      `SELECT id, status, application_number, employee_id, supervisor_id
         FROM leave_applications
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [id]
    );
    if (!app) throw new AppError('Application not found.', 404, 'NOT_FOUND');
    if (app.status !== 'pending_supervisor') {
      throw new AppError(`Cannot review an application in status "${app.status}".`,
        409, 'INVALID_STATUS');
    }

    if (body.action === 'recommend') {
      await conn.query(
        `UPDATE leave_applications
            SET status = 'pending_approver',
                supervisor_action_at = NOW(),
                updated_by = ?
          WHERE id = ?`,
        [req.user.id, id]
      );
      await conn.query(
        `INSERT INTO leave_application_actions
           (application_id, actor_user_id, actor_role_code, actor_stage,
            action, remarks, previous_status, new_status)
         VALUES (?, ?, ?, 'supervisor', 'recommended', ?, 'pending_supervisor', 'pending_approver')`,
        [id, req.user.id, req.user.roleCode, body.remarks ?? null]
      );
    } else {
      await conn.query(
        `UPDATE leave_applications
            SET status = 'rejected',
                supervisor_action_at = NOW(),
                rejected_at = NOW(),
                updated_by = ?
          WHERE id = ?`,
        [req.user.id, id]
      );
      await conn.query(
        `INSERT INTO leave_application_actions
           (application_id, actor_user_id, actor_role_code, actor_stage,
            action, remarks, previous_status, new_status)
         VALUES (?, ?, ?, 'supervisor', 'rejected', ?, 'pending_supervisor', 'rejected')`,
        [id, req.user.id, req.user.roleCode, body.remarks ?? null]
      );
    }
  });

  const [rows] = await pool.query(
    'SELECT * FROM v_leave_applications_full WHERE id = ?',
    [id]
  );
  return ok(res, { application: mapApplication(rows[0]) });
});

/* ================================================================== *
 *  POST /api/leaves/:id/approve
 *  Final approver action: approve (commits credits) or reject.
 *  Body: { action: 'approve'|'reject', remarks?: string }
 * ================================================================== */
export const approveApplication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'action', type: 'enum', required: true, enum: ['approve', 'reject'] },
    { name: 'remarks', type: 'string', max: 500, nullable: true },
  ]);

  // Move to approved inside a transaction first, then commit credits
  await withTransaction(async (conn) => {
    const [[app]] = await conn.query(
      `SELECT id, status, application_number
         FROM leave_applications
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [id]
    );
    if (!app) throw new AppError('Application not found.', 404, 'NOT_FOUND');
    if (app.status !== 'pending_approver') {
      throw new AppError(`Cannot approve an application in status "${app.status}".`,
        409, 'INVALID_STATUS');
    }

    if (body.action === 'approve') {
      await conn.query(
        `UPDATE leave_applications
            SET status = 'approved',
                approver_action_at = NOW(),
                approved_at = NOW(),
                approver_id = COALESCE(approver_id, ?),
                updated_by = ?
          WHERE id = ?`,
        [req.user.id, req.user.id, id]
      );
      await conn.query(
        `INSERT INTO leave_application_actions
           (application_id, actor_user_id, actor_role_code, actor_stage,
            action, remarks, previous_status, new_status)
         VALUES (?, ?, ?, 'approver', 'approved', ?, 'pending_approver', 'approved')`,
        [id, req.user.id, req.user.roleCode, body.remarks ?? null]
      );
    } else {
      await conn.query(
        `UPDATE leave_applications
            SET status = 'rejected',
                approver_action_at = NOW(),
                rejected_at = NOW(),
                updated_by = ?
          WHERE id = ?`,
        [req.user.id, id]
      );
      await conn.query(
        `INSERT INTO leave_application_actions
           (application_id, actor_user_id, actor_role_code, actor_stage,
            action, remarks, previous_status, new_status)
         VALUES (?, ?, ?, 'approver', 'rejected', ?, 'pending_approver', 'rejected')`,
        [id, req.user.id, req.user.roleCode, body.remarks ?? null]
      );
    }
  });

  // If approved, commit the credits — this is its own transaction
  let creditResult = null;
  if (body.action === 'approve') {
    try {
      creditResult = await creditLeaveApplication(id, req.user.id);
    } catch (err) {
      // If credit commitment fails (e.g. insufficient balance race),
      // roll back the approval. This is critical — don't leave an
      // application marked "approved" with no credits deducted.
      await pool.query(
        `UPDATE leave_applications
            SET status = 'pending_approver',
                approved_at = NULL,
                approver_action_at = NULL,
                updated_by = ?
          WHERE id = ?`,
        [req.user.id, id]
      );
      await pool.query(
        `INSERT INTO leave_application_actions
           (application_id, actor_user_id, actor_stage, action, remarks)
         VALUES (?, ?, 'system', 'returned', ?)`,
        [id, req.user.id,
         `Approval rolled back — credit commitment failed: ${err.message}`]
      );
      throw err;
    }
  }

  const [rows] = await pool.query(
    'SELECT * FROM v_leave_applications_full WHERE id = ?',
    [id]
  );
  return ok(res, {
    application: mapApplication(rows[0]),
    creditResult,
  });
});

/* ================================================================== *
 *  POST /api/leaves/:id/cancel
 *  Cancel an application. Employee can cancel own pending/approved;
 *  HR/admin can cancel any.
 * ================================================================== */
export const cancelApplication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'reason', type: 'string', min: 3, max: 500 },
  ]);

  const perms = req.permissions ?? new Set();
  const isHrAdmin = perms.has('employees.update') || perms.has('leave.review');

  await withTransaction(async (conn) => {
    const [[app]] = await conn.query(
      `SELECT la.*, e.user_id AS employee_user_id
         FROM leave_applications la
         JOIN employees e ON e.id = la.employee_id
        WHERE la.id = ? AND la.deleted_at IS NULL
        FOR UPDATE`,
      [id]
    );
    if (!app) throw new AppError('Application not found.', 404, 'NOT_FOUND');

    if (app.status === 'cancelled') {
      throw new AppError('Application is already cancelled.', 409, 'ALREADY_CANCELLED');
    }
    if (app.status === 'rejected') {
      throw new AppError('Rejected applications cannot be cancelled.', 409, 'INVALID_STATUS');
    }

    // Self-cancel: only while pending OR (if approved) within the same day
    const isOwner = app.employee_user_id === req.user.id;
    if (!isHrAdmin) {
      if (!isOwner) {
        throw new AppError('You can only cancel your own applications.', 403, 'FORBIDDEN');
      }
      if (app.status === 'approved' && app.credit_committed) {
        throw new AppError(
          'This application is approved and credits have been committed. ' +
          'Ask HR to reverse it.',
          409, 'APPROVED_CANNOT_SELF_CANCEL'
        );
      }
    }

    // Update the application
    await conn.query(
      `UPDATE leave_applications
          SET status = 'cancelled',
              cancelled_by = ?,
              cancelled_at = NOW(),
              cancelled_reason = ?,
              updated_by = ?
        WHERE id = ?`,
      [req.user.id, body.reason.trim(), req.user.id, id]
    );

    // Audit trail
    await conn.query(
      `INSERT INTO leave_application_actions
         (application_id, actor_user_id, actor_role_code, actor_stage,
          action, remarks, previous_status, new_status)
       VALUES (?, ?, ?, ?, 'cancelled', ?, ?, 'cancelled')`,
      [
        id, req.user.id, req.user.roleCode,
        isHrAdmin && !isOwner ? 'approver' : 'filed',
        body.reason.trim(),
        app.status,
      ]
    );
  });

  // If credits were committed, reverse them in a separate transaction
  const [[appAfter]] = await pool.query(
    'SELECT credit_committed FROM leave_applications WHERE id = ?', [id]
  );
  let reversal = null;
  if (appAfter?.credit_committed) {
    reversal = await reverseCreditForApplication(id, req.user.id,
      `Cancellation reversal — ${body.reason.trim()}`);
  }

  const [rows] = await pool.query(
    'SELECT * FROM v_leave_applications_full WHERE id = ?',
    [id]
  );
  return ok(res, {
    application: mapApplication(rows[0]),
    reversal,
  });
});