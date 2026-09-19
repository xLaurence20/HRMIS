import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination } from '../utils/validate.js';
import { parseCsv, parseTimeFlexible, parseDateFlexible } from '../utils/csv.js';

/* ------------------------------------------------------------------ *
 *  Mappers
 * ------------------------------------------------------------------ */
const mapPeriod = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeNumber: row.employee_number ?? null,
  fullName: row.full_name ?? null,
  departmentId: row.department_id ?? null,
  departmentCode: row.department_code ?? null,
  departmentName: row.department_name ?? null,
  periodYear: row.period_year,
  periodMonth: row.period_month,
  periodLabel: row.period_label
    ?? `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
  status: row.status,
  submittedBy: row.submitted_by,
  submittedAt: row.submitted_at,
  verifiedBy: row.verified_by,
  verifiedAt: row.verified_at,
  lockedBy: row.locked_by,
  lockedAt: row.locked_at,
  remarks: row.remarks,
  logCount: row.log_count !== undefined ? Number(row.log_count) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLog = (row) => ({
  id: row.id,
  periodId: row.period_id,
  employeeId: row.employee_id,
  logDate: row.log_date,
  amArrival: row.am_arrival,
  amDeparture: row.am_departure,
  pmArrival: row.pm_arrival,
  pmDeparture: row.pm_departure,
  overtimeIn: row.overtime_in,
  overtimeOut: row.overtime_out,
  tardinessMinutes: Number(row.tardiness_minutes),
  undertimeMinutes: Number(row.undertime_minutes),
  overtimeMinutes: Number(row.overtime_minutes),
  hoursWorked: Number(row.hours_worked),
  isAbsent: Boolean(row.is_absent),
  isHoliday: Boolean(row.is_holiday),
  holidayId: row.holiday_id,
  holidayName: row.holiday_name ?? null,
  isLeave: Boolean(row.is_leave),
  leaveType: row.leave_type,
  leaveHours: row.leave_hours !== null ? Number(row.leave_hours) : null,
  isLwop: Boolean(row.is_lwop),
  source: row.source,
  remarks: row.remarks,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ------------------------------------------------------------------ *
 *  Helper — permission matrix for period status transitions
 * ------------------------------------------------------------------ */
const ALLOWED_TRANSITIONS = {
  draft:     ['submitted', 'locked'],           // locked directly allowed if no verify needed
  submitted: ['verified', 'draft'],             // reviewer can send back
  verified:  ['locked', 'submitted'],           // approver locks or bounces back
  locked:    [],                                // terminal — must be reopened explicitly
};

/* ================================================================== *
 *  GET /api/dtr/periods
 *  Query: ?year=  ?month=  ?status=  ?departmentId=  ?employeeId=
 *         ?search=  ?page=  ?limit=
 * ================================================================== */
export const listPeriods = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });

  const where = ['dp.deleted_at IS NULL'];
  const params = [];

  if (req.query.year) {
    where.push('dp.period_year = ?');
    params.push(Number(req.query.year));
  }
  if (req.query.month) {
    where.push('dp.period_month = ?');
    params.push(Number(req.query.month));
  }
  if (req.query.status) {
    where.push('dp.status = ?');
    params.push(req.query.status);
  }
  if (req.query.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.employeeId) {
    where.push('dp.employee_id = ?');
    params.push(Number(req.query.employeeId));
  }
  if (req.query.search) {
    const q = `%${req.query.search.trim()}%`;
    where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)');
    params.push(q, q);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
       ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT dp.*,
            e.employee_number, e.full_name, e.department_id,
            d.code AS department_code, d.name AS department_name,
            CONCAT(dp.period_year, '-', LPAD(dp.period_month, 2, '0')) AS period_label,
            (SELECT COUNT(*) FROM dtr_logs dl WHERE dl.period_id = dp.id) AS log_count
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${whereSql}
       ORDER BY dp.period_year DESC, dp.period_month DESC, e.last_name ASC, e.first_name ASC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    periods: rows.map(mapPeriod),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/dtr/periods/:id  — period + all logs + summary
 * ================================================================== */
export const getPeriod = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid period id.', 400, 'VALIDATION_ERROR');

  const [periods] = await pool.query(
    `SELECT dp.*,
            e.employee_number, e.full_name, e.department_id,
            d.code AS department_code, d.name AS department_name,
            CONCAT(dp.period_year, '-', LPAD(dp.period_month, 2, '0')) AS period_label
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE dp.id = ? AND dp.deleted_at IS NULL`,
    [id]
  );

  if (!periods[0]) throw new AppError('DTR period not found.', 404, 'NOT_FOUND');

  const [logs] = await pool.query(
    `SELECT dl.*, h.name AS holiday_name
       FROM dtr_logs dl
       LEFT JOIN holidays h ON h.id = dl.holiday_id
      WHERE dl.period_id = ?
      ORDER BY dl.log_date ASC`,
    [id]
  );

  const [summaries] = await pool.query(
    'SELECT * FROM attendance_summaries WHERE employee_id = ? AND period_year = ? AND period_month = ?',
    [periods[0].employee_id, periods[0].period_year, periods[0].period_month]
  );

  return ok(res, {
    period: mapPeriod(periods[0]),
    logs: logs.map(mapLog),
    summary: summaries[0] ? mapSummaryRow(summaries[0]) : null,
  });
});

function mapSummaryRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
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
  };
}

/* ================================================================== *
 *  POST /api/dtr/periods
 *  Body: { employeeId, periodYear, periodMonth }
 *  Auto-generates one empty dtr_logs row per calendar day in the month,
 *  pre-marked as weekend or holiday.
 * ================================================================== */
export const createPeriod = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'employeeId',  type: 'int', required: true, min: 1 },
    { name: 'periodYear',  type: 'int', required: true, min: 2000, max: 2100 },
    { name: 'periodMonth', type: 'int', required: true, min: 1,    max: 12 },
  ]);

  const newPeriodId = await withTransaction(async (conn) => {
    const [emp] = await conn.query(
      'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
      [body.employeeId]
    );
    if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

    const [existing] = await conn.query(
      `SELECT id FROM dtr_periods
        WHERE employee_id = ? AND period_year = ? AND period_month = ? AND deleted_at IS NULL`,
      [body.employeeId, body.periodYear, body.periodMonth]
    );
    if (existing[0]) {
      throw new AppError('A DTR period already exists for this employee and month.',
        409, 'DUPLICATE_PERIOD', { periodId: existing[0].id });
    }

    const [ins] = await conn.query(
      `INSERT INTO dtr_periods (employee_id, period_year, period_month, status, created_by, updated_by)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [body.employeeId, body.periodYear, body.periodMonth, req.user.id, req.user.id]
    );
    const periodId = ins.insertId;

    // Generate one row per calendar day in the month
    const daysInMonth = new Date(body.periodYear, body.periodMonth, 0).getDate();

    // Preload holidays for the month in one query
    const monthStart = `${body.periodYear}-${String(body.periodMonth).padStart(2, '0')}-01`;
    const monthEnd   = `${body.periodYear}-${String(body.periodMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [holidayRows] = await conn.query(
      `SELECT id, holiday_date, holiday_type
         FROM holidays
        WHERE holiday_date BETWEEN ? AND ?`,
      [monthStart, monthEnd]
    );
    const holidayMap = new Map(
      holidayRows.map((h) => [String(h.holiday_date).slice(0, 10), h])
    );

    const inserts = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${body.periodYear}-${String(body.periodMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(dateStr).getDay();             // 0=Sun, 6=Sat
      const holiday = holidayMap.get(dateStr);

      inserts.push([
        periodId,
        body.employeeId,
        dateStr,
        0, 0, 0, 0,                                        // time columns NULL
        '',                                                 // placeholder — MySQL doesn't take '' for TIME
        0, 0, 0, 0.00,                                     // minutes & hours
        dow === 0 || dow === 6 || holiday ? 0 : 1,          // is_absent default 1 for past workdays
        holiday ? 1 : 0,
        holiday?.id ?? null,
        0, null, null, 0,
        'system',
        null,
        req.user.id,
        req.user.id,
      ]);
    }

    // Manual INSERT with NULL-safe time placeholders
    const placeholders = inserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = inserts.flat().map((v, idx) => {
      // Columns 4..7 are the TIME columns — force null
      const colWithinRow = idx % 21;
      if (colWithinRow === 3 || colWithinRow === 4 || colWithinRow === 5 || colWithinRow === 6) return null;
      return v;
    });

    await conn.query(
      `INSERT INTO dtr_logs
         (period_id, employee_id, log_date,
          am_arrival, am_departure, pm_arrival, pm_departure,
          overtime_in, overtime_out,
          tardiness_minutes, undertime_minutes, overtime_minutes, hours_worked,
          is_absent, is_holiday, holiday_id,
          is_leave, leave_type, leave_hours, is_lwop,
          source, remarks, created_by, updated_by)
       VALUES ${inserts.map(() =>
         '(?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
       ).join(',')}`,
      // 24 columns per row, but two time ones are NULL literals, so 22 binds
      inserts.flatMap((row) => [
        row[0], row[1], row[2],
        row[9], row[10], row[11], row[12],
        row[13], row[14], row[15],
        row[16], row[17], row[18], row[19],
        row[20], row[21], row[22], row[23],
      ])
    );

    return periodId;
  });

  const [rows] = await pool.query(
    `SELECT dp.*, e.employee_number, e.full_name,
            CONCAT(dp.period_year, '-', LPAD(dp.period_month, 2, '0')) AS period_label
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
      WHERE dp.id = ?`,
    [newPeriodId]
  );

  return ok(res, { period: mapPeriod(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/dtr/logs/:id  — edit a single day
 *  Rejected if the parent period is `locked`.
 * ================================================================== */
export const updateLog = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid log id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'amArrival',        type: 'string', max: 8,  nullable: true },
    { name: 'amDeparture',      type: 'string', max: 8,  nullable: true },
    { name: 'pmArrival',        type: 'string', max: 8,  nullable: true },
    { name: 'pmDeparture',      type: 'string', max: 8,  nullable: true },
    { name: 'overtimeIn',       type: 'string', max: 8,  nullable: true },
    { name: 'overtimeOut',      type: 'string', max: 8,  nullable: true },
    { name: 'tardinessMinutes', type: 'int', min: 0, max: 1440 },
    { name: 'undertimeMinutes', type: 'int', min: 0, max: 1440 },
    { name: 'overtimeMinutes',  type: 'int', min: 0, max: 1440 },
    { name: 'hoursWorked',      type: 'number', min: 0, max: 24 },
    { name: 'isAbsent',         type: 'boolean' },
    { name: 'isLeave',          type: 'boolean' },
    { name: 'leaveType',        type: 'string', max: 50, nullable: true },
    { name: 'leaveHours',       type: 'number', min: 0, max: 24, nullable: true },
    { name: 'isLwop',           type: 'boolean' },
    { name: 'remarks',          type: 'string', max: 255, nullable: true },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  const columnMap = {
    amArrival: 'am_arrival', amDeparture: 'am_departure',
    pmArrival: 'pm_arrival', pmDeparture: 'pm_departure',
    overtimeIn: 'overtime_in', overtimeOut: 'overtime_out',
    tardinessMinutes: 'tardiness_minutes',
    undertimeMinutes: 'undertime_minutes',
    overtimeMinutes: 'overtime_minutes',
    hoursWorked: 'hours_worked',
    isAbsent: 'is_absent', isLeave: 'is_leave', leaveType: 'leave_type',
    leaveHours: 'leave_hours', isLwop: 'is_lwop', remarks: 'remarks',
  };

  const updatedId = await withTransaction(async (conn) => {
    const [logs] = await conn.query(
      `SELECT dl.id, dp.status
         FROM dtr_logs dl
         JOIN dtr_periods dp ON dp.id = dl.period_id
        WHERE dl.id = ? FOR UPDATE`,
      [id]
    );
    if (!logs[0]) throw new AppError('DTR log not found.', 404, 'NOT_FOUND');
    if (logs[0].status === 'locked') {
      throw new AppError('This DTR period is locked. Reopen it before editing.',
        409, 'PERIOD_LOCKED');
    }

    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(body)) {
      sets.push(`${columnMap[key]} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    sets.push('updated_by = ?');
    params.push(req.user.id);
    params.push(id);

    await conn.query(`UPDATE dtr_logs SET ${sets.join(', ')} WHERE id = ?`, params);
    return id;
  });

  const [rows] = await pool.query(
    `SELECT dl.*, h.name AS holiday_name
       FROM dtr_logs dl
       LEFT JOIN holidays h ON h.id = dl.holiday_id
      WHERE dl.id = ?`,
    [updatedId]
  );

  return ok(res, { log: mapLog(rows[0]) });
});

/* ================================================================== *
 *  PUT /api/dtr/periods/:id/status
 *  Body: { status: 'submitted' | 'verified' | 'locked' | 'draft', remarks? }
 * ================================================================== */
export const updatePeriodStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid period id.', 400, 'VALIDATION_ERROR');

  const { status: nextStatus, remarks } = req.body ?? {};
  if (!['draft', 'submitted', 'verified', 'locked'].includes(nextStatus)) {
    throw new AppError('Invalid status.', 400, 'VALIDATION_ERROR');
  }

  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT status FROM dtr_periods WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!rows[0]) throw new AppError('DTR period not found.', 404, 'NOT_FOUND');

    const current = rows[0].status;
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        `Cannot transition from "${current}" to "${nextStatus}".`,
        409, 'INVALID_TRANSITION',
        { current, allowed }
      );
    }

    const sets = ['status = ?', 'updated_by = ?'];
    const params = [nextStatus, req.user.id];

    if (remarks !== undefined) {
      sets.push('remarks = ?');
      params.push(remarks);
    }

    if (nextStatus === 'submitted') {
      sets.push('submitted_by = ?', 'submitted_at = NOW()');
      params.push(req.user.id);
    } else if (nextStatus === 'verified') {
      sets.push('verified_by = ?', 'verified_at = NOW()');
      params.push(req.user.id);
    } else if (nextStatus === 'locked') {
      sets.push('locked_by = ?', 'locked_at = NOW()');
      params.push(req.user.id);
    }

    params.push(id);
    await conn.query(
      `UPDATE dtr_periods SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
  });

  // After submitted/verified/locked, recompute the summary so dashboards
  // reflect the latest data. Best-effort — do not fail the transition if
  // recompute errors out.
  try {
    await recomputeSummaryForPeriod(id, req.user.id);
  } catch (err) {
    console.error('[dtr] summary recompute failed after status change:', err.message);
  }

  const [rows] = await pool.query(
    `SELECT dp.*, e.employee_number, e.full_name,
            CONCAT(dp.period_year, '-', LPAD(dp.period_month, 2, '0')) AS period_label
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
      WHERE dp.id = ?`,
    [id]
  );

  return ok(res, { period: mapPeriod(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/dtr/periods/:id  (soft)
 *  Only draft periods can be deleted.
 * ================================================================== */
export const deletePeriod = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid period id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT status FROM dtr_periods WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!rows[0]) throw new AppError('DTR period not found.', 404, 'NOT_FOUND');
  if (rows[0].status !== 'draft') {
    throw new AppError('Only draft periods can be deleted.', 409, 'NOT_DRAFT');
  }

  await pool.query(
    `UPDATE dtr_periods SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user.id, id]
  );

  return ok(res, { message: 'DTR period deleted.' });
});

/* ================================================================== *
 *  GET /api/dtr/periods/:id/print
 *  Returns the payload needed to render CS Form 48.
 * ================================================================== */
export const getPrintPayload = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid period id.', 400, 'VALIDATION_ERROR');

  const [periodRows] = await pool.query(
    `SELECT dp.*,
            e.employee_number, e.full_name, e.first_name, e.middle_name, e.last_name,
            e.department_id,
            d.code AS department_code, d.name AS department_name,
            p.title AS position_title,
            CONCAT(dp.period_year, '-', LPAD(dp.period_month, 2, '0')) AS period_label
       FROM dtr_periods dp
       JOIN employees e ON e.id = dp.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions   p ON p.id = e.position_id
      WHERE dp.id = ? AND dp.deleted_at IS NULL`,
    [id]
  );

  if (!periodRows[0]) throw new AppError('DTR period not found.', 404, 'NOT_FOUND');

  const [logs] = await pool.query(
    `SELECT dl.*, h.name AS holiday_name, h.holiday_type AS holiday_type
       FROM dtr_logs dl
       LEFT JOIN holidays h ON h.id = dl.holiday_id
      WHERE dl.period_id = ?
      ORDER BY dl.log_date ASC`,
    [id]
  );

  const [summaries] = await pool.query(
    `SELECT * FROM attendance_summaries
      WHERE employee_id = ? AND period_year = ? AND period_month = ?`,
    [periodRows[0].employee_id, periodRows[0].period_year, periodRows[0].period_month]
  );

  // Month metadata for header (e.g., "September 2026")
  const monthName = new Date(periodRows[0].period_year, periodRows[0].period_month - 1, 1)
    .toLocaleString('en-PH', { month: 'long' });

  return ok(res, {
    header: {
      employeeNumber: periodRows[0].employee_number,
      fullName: periodRows[0].full_name,
      lastName: periodRows[0].last_name,
      firstName: periodRows[0].first_name,
      middleName: periodRows[0].middle_name,
      positionTitle: periodRows[0].position_title,
      departmentCode: periodRows[0].department_code,
      departmentName: periodRows[0].department_name,
      periodYear: periodRows[0].period_year,
      periodMonth: periodRows[0].period_month,
      periodLabel: periodRows[0].period_label,
      monthName,
    },
    status: periodRows[0].status,
    logs: logs.map(mapLog),
    summary: summaries[0] ? mapSummaryRow(summaries[0]) : null,
  });
});

/* ================================================================== *
 *  POST /api/dtr/upload
 *  Query: ?year=2026&month=9
 *  Body: multipart/form-data with `file` field containing a CSV.
 *
 *  CSV columns (headers, order-flexible, case-insensitive):
 *    employee_number, log_date, am_arrival, am_departure,
 *    pm_arrival, pm_departure, overtime_in, overtime_out, remarks
 * ================================================================== */
export const uploadCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded.', 400, 'NO_FILE');

  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('year and month query params are required.', 400, 'VALIDATION_ERROR');
  }

  const text = req.file.buffer.toString('utf8');
  const { headers, rows } = parseCsv(text);

  if (rows.length === 0) {
    throw new AppError('CSV contains no data rows.', 400, 'EMPTY_CSV');
  }

  const required = ['employee_number', 'log_date'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) {
    throw new AppError(`Missing required column(s): ${missing.join(', ')}.`, 400,
      'MISSING_COLUMNS', { required, headers });
  }

  const result = {
    rowsProcessed: 0,
    rowsAccepted: 0,
    rowsSkipped: 0,
    periodsCreated: 0,
    logsInserted: 0,
    logsUpdated: 0,
    errors: [],
  };

  await withTransaction(async (conn) => {
    // Preload employee_number -> id
    const [empRows] = await conn.query(
      'SELECT id, employee_number FROM employees WHERE deleted_at IS NULL'
    );
    const empByNumber = new Map(empRows.map((e) => [e.employee_number, e.id]));

    // Preload holidays for the month
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const [holidayRows] = await conn.query(
      `SELECT id, holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?`,
      [monthStart, monthEnd]
    );
    const holidayByDate = new Map(
      holidayRows.map((h) => [String(h.holiday_date).slice(0, 10), h.id])
    );

    // Cache of employee_id -> period_id (lazy create)
    const periodByEmployee = new Map();
    async function ensurePeriod(employeeId) {
      if (periodByEmployee.has(employeeId)) return periodByEmployee.get(employeeId);

      const [found] = await conn.query(
        `SELECT id FROM dtr_periods
          WHERE employee_id = ? AND period_year = ? AND period_month = ? AND deleted_at IS NULL`,
        [employeeId, year, month]
      );
      if (found[0]) {
        periodByEmployee.set(employeeId, found[0].id);
        return found[0].id;
      }

      const [ins] = await conn.query(
        `INSERT INTO dtr_periods
           (employee_id, period_year, period_month, status, created_by, updated_by)
         VALUES (?, ?, ?, 'draft', ?, ?)`,
        [employeeId, year, month, req.user.id, req.user.id]
      );
      result.periodsCreated++;
      periodByEmployee.set(employeeId, ins.insertId);
      return ins.insertId;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 2; // header is line 1

      result.rowsProcessed++;

      const employeeNumber = row.employee_number?.trim();
      const logDate = parseDateFlexible(row.log_date);

      if (!employeeNumber || !logDate) {
        result.rowsSkipped++;
        result.errors.push({ line: lineNo, reason: 'Missing employee_number or invalid log_date.' });
        continue;
      }

      const employeeId = empByNumber.get(employeeNumber);
      if (!employeeId) {
        result.rowsSkipped++;
        result.errors.push({ line: lineNo, reason: `Employee "${employeeNumber}" not found.` });
        continue;
      }

      // Confirm the log date is within the specified month
      if (!logDate.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) {
        result.rowsSkipped++;
        result.errors.push({ line: lineNo, reason: `log_date "${logDate}" is outside ${year}-${String(month).padStart(2, '0')}.` });
        continue;
      }

      const periodId = await ensurePeriod(employeeId);

      const amIn  = parseTimeFlexible(row.am_arrival);
      const amOut = parseTimeFlexible(row.am_departure);
      const pmIn  = parseTimeFlexible(row.pm_arrival);
      const pmOut = parseTimeFlexible(row.pm_departure);
      const otIn  = parseTimeFlexible(row.overtime_in);
      const otOut = parseTimeFlexible(row.overtime_out);

      const holidayId = holidayByDate.get(logDate) ?? null;
      const hasTime = amIn || amOut || pmIn || pmOut;

      // Compute hours worked (simple AM + PM)
      const hoursWorked = computeHours(amIn, amOut, pmIn, pmOut);

      const [existing] = await conn.query(
        'SELECT id FROM dtr_logs WHERE employee_id = ? AND log_date = ?',
        [employeeId, logDate]
      );

      if (existing[0]) {
        await conn.query(
          `UPDATE dtr_logs SET
             am_arrival = ?, am_departure = ?,
             pm_arrival = ?, pm_departure = ?,
             overtime_in = ?, overtime_out = ?,
             hours_worked = ?,
             is_absent = ?,
             is_holiday = ?, holiday_id = ?,
             source = 'csv_upload',
             remarks = COALESCE(?, remarks),
             updated_by = ?
           WHERE id = ?`,
          [
            amIn, amOut, pmIn, pmOut, otIn, otOut,
            hoursWorked,
            hasTime ? 0 : 1,
            holidayId ? 1 : 0, holidayId,
            row.remarks?.trim() || null,
            req.user.id,
            existing[0].id,
          ]
        );
        result.logsUpdated++;
      } else {
        await conn.query(
          `INSERT INTO dtr_logs
             (period_id, employee_id, log_date,
              am_arrival, am_departure, pm_arrival, pm_departure,
              overtime_in, overtime_out, hours_worked,
              is_absent, is_holiday, holiday_id,
              source, remarks, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_upload', ?, ?, ?)`,
          [
            periodId, employeeId, logDate,
            amIn, amOut, pmIn, pmOut, otIn, otOut, hoursWorked,
            hasTime ? 0 : 1,
            holidayId ? 1 : 0, holidayId,
            row.remarks?.trim() || null,
            req.user.id, req.user.id,
          ]
        );
        result.logsInserted++;
      }

      result.rowsAccepted++;
    }
  });

  // Recompute summaries for all affected employees (best-effort)
  try {
    const affected = [...new Set(rows.map((r) => r.employee_number).filter(Boolean))];
    for (const num of affected) {
      const [e] = await pool.query(
        'SELECT id FROM employees WHERE employee_number = ?',
        [num]
      );
      if (e[0]) {
        await recomputeSummary(e[0].id, year, month, req.user.id);
      }
    }
  } catch (err) {
    console.error('[dtr] post-upload summary recompute failed:', err.message);
  }

  return ok(res, { upload: result }, 201);
});

/* ------------------------------------------------------------------ *
 *  Hours worked helper (naive AM + PM total)
 * ------------------------------------------------------------------ */
function computeHours(amIn, amOut, pmIn, pmOut) {
  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  let total = 0;
  const amInMin = toMin(amIn), amOutMin = toMin(amOut);
  const pmInMin = toMin(pmIn), pmOutMin = toMin(pmOut);

  if (amInMin !== null && amOutMin !== null && amOutMin > amInMin) {
    total += amOutMin - amInMin;
  }
  if (pmInMin !== null && pmOutMin !== null && pmOutMin > pmInMin) {
    total += pmOutMin - pmInMin;
  }

  return Math.round((total / 60) * 100) / 100;
}

/* ------------------------------------------------------------------ *
 *  Summary recompute — used by status transitions and manual endpoint
 * ------------------------------------------------------------------ */
export async function recomputeSummary(employeeId, year, month, actorUserId = null, conn = pool) {
  await conn.query(
    `INSERT INTO attendance_summaries
       (employee_id, period_year, period_month,
        working_days, days_worked, days_absent, days_leave, days_lwop,
        tardy_minutes_total, undertime_minutes_total, overtime_minutes_total,
        hours_worked_total, tardy_count, absence_count, computed_at, computed_by)
     SELECT
       dl.employee_id,
       dp.period_year,
       dp.period_month,
       COALESCE(SUM(CASE
         WHEN DAYOFWEEK(dl.log_date) NOT IN (1, 7)
              AND dl.is_holiday = 0 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN dl.hours_worked > 0 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN dl.is_absent = 1 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN dl.is_leave = 1 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN dl.is_lwop = 1 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(dl.tardiness_minutes), 0),
       COALESCE(SUM(dl.undertime_minutes), 0),
       COALESCE(SUM(dl.overtime_minutes), 0),
       COALESCE(SUM(dl.hours_worked), 0),
       COALESCE(SUM(CASE WHEN dl.tardiness_minutes > 0 THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN dl.is_absent = 1 THEN 1 ELSE 0 END), 0),
       NOW(),
       ?
     FROM dtr_logs dl
     JOIN dtr_periods dp ON dp.id = dl.period_id
     WHERE dl.employee_id = ?
       AND dp.period_year = ?
       AND dp.period_month = ?
       AND dp.deleted_at IS NULL
     GROUP BY dl.employee_id, dp.period_year, dp.period_month
     ON DUPLICATE KEY UPDATE
       working_days            = VALUES(working_days),
       days_worked             = VALUES(days_worked),
       days_absent             = VALUES(days_absent),
       days_leave              = VALUES(days_leave),
       days_lwop               = VALUES(days_lwop),
       tardy_minutes_total     = VALUES(tardy_minutes_total),
       undertime_minutes_total = VALUES(undertime_minutes_total),
       overtime_minutes_total  = VALUES(overtime_minutes_total),
       hours_worked_total      = VALUES(hours_worked_total),
       tardy_count             = VALUES(tardy_count),
       absence_count           = VALUES(absence_count),
       computed_at             = NOW(),
       computed_by             = VALUES(computed_by)`,
    [actorUserId, employeeId, year, month]
  );
}

async function recomputeSummaryForPeriod(periodId, actorUserId) {
  const [rows] = await pool.query(
    'SELECT employee_id, period_year, period_month FROM dtr_periods WHERE id = ?',
    [periodId]
  );
  if (!rows[0]) return;
  await recomputeSummary(
    rows[0].employee_id, rows[0].period_year, rows[0].period_month, actorUserId
  );
}

/* ================================================================== *
 *  POST /api/dtr/periods/:id/recompute
 * ================================================================== */
export const recomputePeriod = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid period id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    `SELECT employee_id, period_year, period_month FROM dtr_periods
      WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) throw new AppError('DTR period not found.', 404, 'NOT_FOUND');

  await recomputeSummary(
    rows[0].employee_id, rows[0].period_year, rows[0].period_month, req.user.id
  );

  const [summary] = await pool.query(
    `SELECT * FROM attendance_summaries
      WHERE employee_id = ? AND period_year = ? AND period_month = ?`,
    [rows[0].employee_id, rows[0].period_year, rows[0].period_month]
  );

  return ok(res, { summary: mapSummaryRow(summary[0]) });
});