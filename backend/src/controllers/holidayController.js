import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid } from '../utils/validate.js';

const mapHoliday = (row) => ({
  id: row.id,
  holidayDate: row.holiday_date,
  name: row.name,
  holidayType: row.holiday_type,
  isRecurring: Boolean(row.is_recurring),
  legalBasis: row.legal_basis,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ================================================================== *
 *  GET /api/holidays?year=2026
 * ================================================================== */
export const listHolidays = asyncHandler(async (req, res) => {
  const where = [];
  const params = [];

  if (req.query.year) {
    const y = Number(req.query.year);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) {
      throw new AppError('Invalid year.', 400, 'VALIDATION_ERROR');
    }
    where.push('YEAR(holiday_date) = ?');
    params.push(y);
  }

  if (req.query.type) {
    where.push('holiday_type = ?');
    params.push(req.query.type);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT * FROM holidays ${whereSql}
      ORDER BY holiday_date ASC`,
    params
  );

  return ok(res, { holidays: rows.map(mapHoliday) });
});

/* ================================================================== *
 *  POST /api/holidays
 * ================================================================== */
export const createHoliday = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'holidayDate', type: 'date', required: true },
    { name: 'name',        type: 'string', required: true, min: 2, max: 150 },
    { name: 'holidayType', type: 'enum', required: true,
      enum: ['regular', 'special_non_working', 'special_working'] },
    { name: 'isRecurring', type: 'boolean', transform: (v) => v ?? false },
    { name: 'legalBasis',  type: 'string', max: 255, nullable: true },
  ]);

  const [result] = await pool.query(
    `INSERT INTO holidays (holiday_date, name, holiday_type, is_recurring, legal_basis, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      body.holidayDate, body.name, body.holidayType,
      body.isRecurring ? 1 : 0, body.legalBasis ?? null, req.user.id,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM holidays WHERE id = ?', [result.insertId]);
  return ok(res, { holiday: mapHoliday(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/holidays/:id
 * ================================================================== */
export const updateHoliday = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid holiday id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'holidayDate', type: 'date' },
    { name: 'name',        type: 'string', min: 2, max: 150 },
    { name: 'holidayType', type: 'enum',
      enum: ['regular', 'special_non_working', 'special_working'] },
    { name: 'isRecurring', type: 'boolean' },
    { name: 'legalBasis',  type: 'string', max: 255, nullable: true },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  const columnMap = {
    holidayDate: 'holiday_date',
    name: 'name',
    holidayType: 'holiday_type',
    isRecurring: 'is_recurring',
    legalBasis: 'legal_basis',
  };

  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(body)) {
    sets.push(`${columnMap[key]} = ?`);
    params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  params.push(id);

  const [result] = await pool.query(
    `UPDATE holidays SET ${sets.join(', ')} WHERE id = ?`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Holiday not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query('SELECT * FROM holidays WHERE id = ?', [id]);
  return ok(res, { holiday: mapHoliday(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/holidays/:id
 *  Hard delete — dtr_logs.holiday_id is SET NULL by the FK.
 * ================================================================== */
export const deleteHoliday = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid holiday id.', 400, 'VALIDATION_ERROR');

  const [result] = await pool.query('DELETE FROM holidays WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new AppError('Holiday not found.', 404, 'NOT_FOUND');
  }

  return ok(res, { message: 'Holiday deleted.' });
});