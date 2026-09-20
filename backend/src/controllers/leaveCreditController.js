import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination } from '../utils/validate.js';
import {
  getEmployeeBalances, getBalance, getLedger, adjustBalance,
  postMonthlyAccrual, postAnnualAccrual,
} from '../services/leaveCreditService.js';

/* ================================================================== *
 *  GET /api/leave-credits/me
 *  Current user's balances across all credited leave types.
 * ================================================================== */
export const getMyBalances = asyncHandler(async (req, res) => {
  const [emp] = await pool.query(
    'SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.id]
  );
  if (!emp[0]) {
    return ok(res, { employeeId: null, balances: [] });
  }

  const balances = await getEmployeeBalances(emp[0].id);
  return ok(res, { employeeId: emp[0].id, balances });
});

/* ================================================================== *
 *  GET /api/leave-credits/employee/:employeeId
 *  HR/admin view of another employee's balances.
 * ================================================================== */
export const getEmployeeBalancesById = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');
  }

  const [emp] = await pool.query(
    'SELECT id, full_name, employee_number FROM employees WHERE id = ? AND deleted_at IS NULL',
    [employeeId]
  );
  if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const balances = await getEmployeeBalances(employeeId);
  return ok(res, {
    employee: {
      id: emp[0].id,
      fullName: emp[0].full_name,
      employeeNumber: emp[0].employee_number,
    },
    balances,
  });
});

/* ================================================================== *
 *  GET /api/leave-credits/employee/:employeeId/ledger
 *  Query: ?leaveTypeId=&fromDate=&toDate=&transactionType=&page=&limit=
 * ================================================================== */
export const getEmployeeLedger = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');
  }

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

  const leaveTypeId = req.query.leaveTypeId ? Number(req.query.leaveTypeId) : null;
  const fromDate = req.query.fromDate || null;
  const toDate = req.query.toDate || null;
  const transactionType = req.query.transactionType || null;

  const { ledger, total } = await getLedger({
    employeeId, leaveTypeId, fromDate, toDate, transactionType, limit, offset,
  });

  return ok(res, {
    ledger,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  POST /api/leave-credits/adjust
 *  HR/admin manual adjustment with mandatory reason.
 *  Body: { employeeId, leaveTypeId, amount, reason, effectiveDate? }
 * ================================================================== */
export const adjust = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'employeeId',  type: 'int', required: true, min: 1 },
    { name: 'leaveTypeId', type: 'int', required: true, min: 1 },
    { name: 'amount',      type: 'number', required: true, min: -365, max: 365 },
    { name: 'reason',      type: 'string', required: true, min: 5, max: 500 },
    { name: 'effectiveDate', type: 'date', nullable: true },
  ]);

  const result = await adjustBalance({
    employeeId: body.employeeId,
    leaveTypeId: body.leaveTypeId,
    amount: body.amount,
    reason: body.reason,
    actorUserId: req.user.id,
    effectiveDate: body.effectiveDate,
  });

  return ok(res, { adjustment: result }, 201);
});

/* ================================================================== *
 *  POST /api/leave-credits/accrue/monthly
 *  Body: { year, month }
 *  Idempotent — safe to re-run for the same period.
 * ================================================================== */
export const runMonthlyAccrual = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'year',  type: 'int', required: true, min: 2000, max: 2100 },
    { name: 'month', type: 'int', required: true, min: 1, max: 12 },
  ]);

  const result = await postMonthlyAccrual(body.year, body.month, req.user.id);
  return ok(res, { accrual: result }, 201);
});

/* ================================================================== *
 *  POST /api/leave-credits/accrue/annual
 *  Body: { year }
 * ================================================================== */
export const runAnnualAccrual = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'year', type: 'int', required: true, min: 2000, max: 2100 },
  ]);

  const result = await postAnnualAccrual(body.year, req.user.id);
  return ok(res, { accrual: result }, 201);
});

/* ================================================================== *
 *  GET /api/leave-credits/summary
 *  Quick summary across all employees for the current month.
 *  Used by the HR dashboard.
 * ================================================================== */
export const getSummary = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT
       lt.code, lt.name, lt.color_hex,
       COUNT(b.id)              AS employee_count,
       COALESCE(SUM(b.balance), 0) AS total_balance,
       COALESCE(AVG(b.balance), 0) AS avg_balance,
       COALESCE(MIN(b.balance), 0) AS min_balance,
       COALESCE(MAX(b.balance), 0) AS max_balance
     FROM leave_types lt
     LEFT JOIN leave_credit_balances b ON b.leave_type_id = lt.id
     WHERE lt.deleted_at IS NULL AND lt.is_active = 1 AND lt.is_credited = 1
     GROUP BY lt.id, lt.code, lt.name, lt.color_hex
     ORDER BY lt.sort_order, lt.code`
  );

  return ok(res, {
    summary: rows.map((r) => ({
      code: r.code,
      name: r.name,
      colorHex: r.color_hex,
      employeeCount: Number(r.employee_count),
      totalBalance: Number(r.total_balance),
      avgBalance: Number(r.avg_balance),
      minBalance: Number(r.min_balance),
      maxBalance: Number(r.max_balance),
    })),
  });
});