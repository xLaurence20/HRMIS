import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination } from '../utils/validate.js';
import { recomputeSummary } from './dtrController.js';

/* ------------------------------------------------------------------ *
 *  Mappers
 * ------------------------------------------------------------------ */
const mapSummary = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeNumber: row.employee_number,
  fullName: row.full_name,
  departmentId: row.department_id,
  departmentCode: row.department_code,
  departmentName: row.department_name,
  periodYear: row.period_year,
  periodMonth: row.period_month,
  periodLabel: `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
  workingDays: Number(row.working_days),
  daysWorked: Number(row.days_worked),
  daysAbsent: Number(row.days_absent),
  daysLeave: Number(row.days_leave),
  daysLwop: Number(row.days_lwop),
  tardyMinutesTotal: Number(row.tardy_minutes_total),
  undertimeMinutesTotal: Number(row.undertime_minutes_total),
  overtimeMinutesTotal: Number(row.overtime_minutes_total),
  hoursWorkedTotal: Number(row.hours_worked_total),
  tardyCount: Number(row.tardy_count),
  absenceCount: Number(row.absence_count),
  computedAt: row.computed_at,
});

/* ================================================================== *
 *  GET /api/attendance/summaries
 *  Query: ?year=  ?month=  ?departmentId=  ?employeeId=
 *         ?overThreshold=true  ?page=  ?limit=
 * ================================================================== */
export const listSummaries = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

  const where = ['1 = 1'];
  const params = [];

  if (req.query.year) {
    where.push('a.period_year = ?');
    params.push(Number(req.query.year));
  }
  if (req.query.month) {
    where.push('a.period_month = ?');
    params.push(Number(req.query.month));
  }
  if (req.query.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.employeeId) {
    where.push('a.employee_id = ?');
    params.push(Number(req.query.employeeId));
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  // Threshold resolution: per-department override wins, else global default.
  // We join to a "resolved threshold" subquery so the query stays readable.
  const thresholdJoin = `
    LEFT JOIN attendance_thresholds t
      ON t.department_id = e.department_id AND t.is_active = 1
    LEFT JOIN attendance_thresholds g
      ON g.department_id IS NULL AND g.is_active = 1
  `;

  const overThresholdSql = req.query.overThreshold === 'true'
    ? `AND (
         a.tardy_minutes_total     > COALESCE(t.tardy_minutes_monthly, g.tardy_minutes_monthly, 60)
      OR a.undertime_minutes_total > COALESCE(t.undertime_minutes_monthly, g.undertime_minutes_monthly, 60)
      OR a.absence_count           > COALESCE(t.absences_monthly, g.absences_monthly, 2)
       )`
    : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM attendance_summaries a
       JOIN employees e ON e.id = a.employee_id
       ${thresholdJoin}
       ${whereSql} ${overThresholdSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT a.*,
            e.employee_number, e.full_name, e.department_id,
            d.code AS department_code, d.name AS department_name,
            COALESCE(t.tardy_minutes_monthly,     g.tardy_minutes_monthly,     60)  AS thresh_tardy,
            COALESCE(t.undertime_minutes_monthly, g.undertime_minutes_monthly, 60)  AS thresh_undertime,
            COALESCE(t.absences_monthly,          g.absences_monthly,          2.0) AS thresh_absences
       FROM attendance_summaries a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${thresholdJoin}
       ${whereSql} ${overThresholdSql}
       ORDER BY a.period_year DESC, a.period_month DESC, a.tardy_minutes_total DESC, e.last_name ASC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    summaries: rows.map((r) => ({
      ...mapSummary(r),
      thresholds: {
        tardyMinutes: Number(r.thresh_tardy),
        undertimeMinutes: Number(r.thresh_undertime),
        absences: Number(r.thresh_absences),
      },
      exceedsThreshold: {
        tardy: Number(r.tardy_minutes_total) > Number(r.thresh_tardy),
        undertime: Number(r.undertime_minutes_total) > Number(r.thresh_undertime),
        absences: Number(r.absence_count) > Number(r.thresh_absences),
      },
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/attendance/dashboard?year=&month=&departmentId=
 *  Executive summary of the chosen month.
 * ================================================================== */
export const getDashboard = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;

  const filters = ['a.period_year = ?', 'a.period_month = ?'];
  const params = [year, month];
  if (departmentId) {
    filters.push('e.department_id = ?');
    params.push(departmentId);
  }
  const whereSql = `WHERE ${filters.join(' AND ')}`;

  // Top-line totals
  const [totals] = await pool.query(
    `SELECT
       COUNT(*)                                        AS employee_count,
       COALESCE(SUM(a.tardy_minutes_total), 0)         AS tardy_minutes,
       COALESCE(SUM(a.undertime_minutes_total), 0)     AS undertime_minutes,
       COALESCE(SUM(a.absence_count), 0)               AS absence_days,
       COALESCE(SUM(a.tardy_count), 0)                 AS tardy_days,
       COALESCE(SUM(a.hours_worked_total), 0)          AS hours_worked
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     ${whereSql}`,
    params
  );

  // Department rollup
  const [byDepartment] = await pool.query(
    `SELECT
       d.id, d.code, d.name,
       COUNT(*)                                   AS employees,
       COALESCE(SUM(a.tardy_minutes_total), 0)    AS tardy_minutes,
       COALESCE(SUM(a.undertime_minutes_total),0) AS undertime_minutes,
       COALESCE(SUM(a.absence_count), 0)          AS absence_days
     FROM attendance_summaries a
     JOIN employees e    ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     ${whereSql}
     GROUP BY d.id, d.code, d.name
     ORDER BY tardy_minutes DESC, absence_days DESC`,
    params
  );

  // Top offenders (up to 10)
  const [topTardy] = await pool.query(
    `SELECT a.employee_id, e.employee_number, e.full_name,
            d.code AS department_code, d.name AS department_name,
            a.tardy_minutes_total, a.tardy_count,
            a.absence_count, a.undertime_minutes_total
       FROM attendance_summaries a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${whereSql}
       ORDER BY a.tardy_minutes_total DESC, a.absence_count DESC
       LIMIT 10`,
    params
  );

  // Monthly trend for the last 6 months (respecting department filter)
  const [trend] = await pool.query(
    `SELECT
       a.period_year, a.period_month,
       SUM(a.tardy_minutes_total)  AS tardy_minutes,
       SUM(a.absence_count)        AS absence_days
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     WHERE ${departmentId ? 'e.department_id = ?' : '1 = 1'}
     GROUP BY a.period_year, a.period_month
     ORDER BY a.period_year DESC, a.period_month DESC
     LIMIT 6`,
    departmentId ? [departmentId] : []
  );

  return ok(res, {
    period: { year, month, label: `${year}-${String(month).padStart(2, '0')}` },
    totals: {
      employeeCount: Number(totals[0].employee_count),
      tardyMinutes: Number(totals[0].tardy_minutes),
      undertimeMinutes: Number(totals[0].undertime_minutes),
      absenceDays: Number(totals[0].absence_days),
      tardyDays: Number(totals[0].tardy_days),
      hoursWorked: Number(totals[0].hours_worked),
    },
    byDepartment: byDepartment.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      employees: Number(d.employees),
      tardyMinutes: Number(d.tardy_minutes),
      undertimeMinutes: Number(d.undertime_minutes),
      absenceDays: Number(d.absence_days),
    })),
    topTardy: topTardy.map((r) => ({
      employeeId: r.employee_id,
      employeeNumber: r.employee_number,
      fullName: r.full_name,
      departmentCode: r.department_code,
      departmentName: r.department_name,
      tardyMinutes: Number(r.tardy_minutes_total),
      tardyDays: Number(r.tardy_count),
      absenceDays: Number(r.absence_count),
      undertimeMinutes: Number(r.undertime_minutes_total),
    })),
    trend: trend.reverse().map((t) => ({
      year: t.period_year,
      month: t.period_month,
      label: `${t.period_year}-${String(t.period_month).padStart(2, '0')}`,
      tardyMinutes: Number(t.tardy_minutes),
      absenceDays: Number(t.absence_days),
    })),
  });
});

/* ================================================================== *
 *  GET /api/attendance/alerts?year=&month=&departmentId=
 *  Returns only employees exceeding the applicable threshold.
 * ================================================================== */
export const listAlerts = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;

  const params = [year, month];
  const deptFilter = departmentId ? 'AND e.department_id = ?' : '';
  if (departmentId) params.push(departmentId);

  const [rows] = await pool.query(
    `SELECT
       a.employee_id, e.employee_number, e.full_name,
       e.department_id, d.code AS department_code, d.name AS department_name,
       a.tardy_minutes_total, a.undertime_minutes_total,
       a.absence_count, a.tardy_count,
       COALESCE(t.tardy_minutes_monthly,     g.tardy_minutes_monthly,     60)  AS thresh_tardy,
       COALESCE(t.undertime_minutes_monthly, g.undertime_minutes_monthly, 60)  AS thresh_undertime,
       COALESCE(t.absences_monthly,          g.absences_monthly,          2.0) AS thresh_absences
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN attendance_thresholds t
       ON t.department_id = e.department_id AND t.is_active = 1
     LEFT JOIN attendance_thresholds g
       ON g.department_id IS NULL AND g.is_active = 1
     WHERE a.period_year = ? AND a.period_month = ?
       ${deptFilter}
       AND (
            a.tardy_minutes_total     > COALESCE(t.tardy_minutes_monthly,     g.tardy_minutes_monthly,     60)
         OR a.undertime_minutes_total > COALESCE(t.undertime_minutes_monthly, g.undertime_minutes_monthly, 60)
         OR a.absence_count           > COALESCE(t.absences_monthly,          g.absences_monthly,          2.0)
       )
     ORDER BY a.tardy_minutes_total DESC, a.absence_count DESC`,
    params
  );

  return ok(res, {
    period: { year, month },
    alerts: rows.map((r) => {
      const reasons = [];
      if (Number(r.tardy_minutes_total) > Number(r.thresh_tardy))
        reasons.push({ type: 'tardy', value: Number(r.tardy_minutes_total), threshold: Number(r.thresh_tardy) });
      if (Number(r.undertime_minutes_total) > Number(r.thresh_undertime))
        reasons.push({ type: 'undertime', value: Number(r.undertime_minutes_total), threshold: Number(r.thresh_undertime) });
      if (Number(r.absence_count) > Number(r.thresh_absences))
        reasons.push({ type: 'absences', value: Number(r.absence_count), threshold: Number(r.thresh_absences) });

      return {
        employeeId: r.employee_id,
        employeeNumber: r.employee_number,
        fullName: r.full_name,
        departmentCode: r.department_code,
        departmentName: r.department_name,
        tardyMinutes: Number(r.tardy_minutes_total),
        undertimeMinutes: Number(r.undertime_minutes_total),
        absenceDays: Number(r.absence_count),
        tardyDays: Number(r.tardy_count),
        reasons,
      };
    }),
  });
});

/* ================================================================== *
 *  POST /api/attendance/summaries/recompute
 *  Body: { year, month, employeeId? }
 *  Recomputes summaries for all (or one) employee(s) in that month.
 * ================================================================== */
export const recomputeSummaries = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'year',       type: 'int', required: true, min: 2000, max: 2100 },
    { name: 'month',      type: 'int', required: true, min: 1,    max: 12 },
    { name: 'employeeId', type: 'int', min: 1, nullable: true },
  ]);

  const where = ['dp.period_year = ?', 'dp.period_month = ?', 'dp.deleted_at IS NULL'];
  const params = [body.year, body.month];
  if (body.employeeId) {
    where.push('dp.employee_id = ?');
    params.push(body.employeeId);
  }

  const [periods] = await pool.query(
    `SELECT dp.employee_id
       FROM dtr_periods dp
      WHERE ${where.join(' AND ')}`,
    params
  );

  let recomputed = 0;
  for (const p of periods) {
    try {
      await recomputeSummary(p.employee_id, body.year, body.month, req.user.id);
      recomputed++;
    } catch (err) {
      console.error(`[attendance] recompute failed for employee ${p.employee_id}:`, err.message);
    }
  }

  return ok(res, { recomputed });
});

/* ================================================================== *
 *  GET /api/attendance/thresholds
 * ================================================================== */
export const listThresholds = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, d.code AS department_code, d.name AS department_name
       FROM attendance_thresholds t
       LEFT JOIN departments d ON d.id = t.department_id
      ORDER BY t.department_id IS NULL DESC, d.name ASC`
  );

  return ok(res, {
    thresholds: rows.map((r) => ({
      id: r.id,
      departmentId: r.department_id,
      departmentCode: r.department_code,
      departmentName: r.department_name,
      tardyMinutesMonthly: Number(r.tardy_minutes_monthly),
      undertimeMinutesMonthly: Number(r.undertime_minutes_monthly),
      absencesMonthly: Number(r.absences_monthly),
      isActive: Boolean(r.is_active),
      updatedAt: r.updated_at,
    })),
  });
});

/* ================================================================== *
 *  POST /api/attendance/thresholds  (create — one per department)
 * ================================================================== */
export const createThreshold = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'departmentId', type: 'int', min: 1, nullable: true },
    { name: 'tardyMinutesMonthly',     type: 'int', min: 0, max: 100000,
      transform: (v) => (v === undefined ? 60 : v) },
    { name: 'undertimeMinutesMonthly', type: 'int', min: 0, max: 100000,
      transform: (v) => (v === undefined ? 60 : v) },
    { name: 'absencesMonthly',         type: 'number', min: 0, max: 31,
      transform: (v) => (v === undefined ? 2 : v) },
    { name: 'isActive', type: 'boolean', transform: (v) => (v === undefined ? true : v) },
  ]);

  const [result] = await pool.query(
    `INSERT INTO attendance_thresholds
       (department_id, tardy_minutes_monthly, undertime_minutes_monthly, absences_monthly,
        is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      body.departmentId ?? null,
      body.tardyMinutesMonthly, body.undertimeMinutesMonthly, body.absencesMonthly,
      body.isActive ? 1 : 0, req.user.id, req.user.id,
    ]
  );

  const [rows] = await pool.query(
    'SELECT * FROM attendance_thresholds WHERE id = ?',
    [result.insertId]
  );

  return ok(res, { threshold: rows[0] }, 201);
});

/* ================================================================== *
 *  PUT /api/attendance/thresholds/:id
 * ================================================================== */
export const updateThreshold = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid threshold id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'tardyMinutesMonthly',     type: 'int', min: 0, max: 100000 },
    { name: 'undertimeMinutesMonthly', type: 'int', min: 0, max: 100000 },
    { name: 'absencesMonthly',         type: 'number', min: 0, max: 31 },
    { name: 'isActive',                type: 'boolean' },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  const columnMap = {
    tardyMinutesMonthly: 'tardy_minutes_monthly',
    undertimeMinutesMonthly: 'undertime_minutes_monthly',
    absencesMonthly: 'absences_monthly',
    isActive: 'is_active',
  };

  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(body)) {
    sets.push(`${columnMap[key]} = ?`);
    params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  sets.push('updated_by = ?');
  params.push(req.user.id);
  params.push(id);

  const [result] = await pool.query(
    `UPDATE attendance_thresholds SET ${sets.join(', ')} WHERE id = ?`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Threshold not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query(
    'SELECT * FROM attendance_thresholds WHERE id = ?',
    [id]
  );

  return ok(res, { threshold: rows[0] });
});

/* ================================================================== *
 *  DELETE /api/attendance/thresholds/:id
 *  The global default (department_id IS NULL) cannot be deleted.
 * ================================================================== */
export const deleteThreshold = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid threshold id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT department_id FROM attendance_thresholds WHERE id = ?',
    [id]
  );
  if (!rows[0]) throw new AppError('Threshold not found.', 404, 'NOT_FOUND');
  if (rows[0].department_id === null) {
    throw new AppError('The global default threshold cannot be deleted.', 409, 'PROTECTED');
  }

  await pool.query('DELETE FROM attendance_thresholds WHERE id = ?', [id]);
  return ok(res, { message: 'Threshold deleted.' });
});