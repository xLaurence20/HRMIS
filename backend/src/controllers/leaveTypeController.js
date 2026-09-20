import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid } from '../utils/validate.js';

const CATEGORIES = [
  'regular', 'special', 'maternity', 'paternity',
  'study', 'rehabilitation', 'unpaid', 'other',
];

const ACCRUAL_METHODS = ['monthly', 'annual', 'one_time', 'manual_only'];

const mapLeaveType = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  shortName: row.short_name,
  description: row.description,
  category: row.category,

  isPaid: Boolean(row.is_paid),
  isCredited: Boolean(row.is_credited),
  isEncashable: Boolean(row.is_encashable),

  accrualMethod: row.accrual_method,
  accrualAmount: Number(row.accrual_amount),
  maxBalanceCap: row.max_balance_cap !== null ? Number(row.max_balance_cap) : null,

  maxDaysPerRequest: row.max_days_per_request !== null ? Number(row.max_days_per_request) : null,
  maxDaysPerYear: row.max_days_per_year !== null ? Number(row.max_days_per_year) : null,
  minNoticeDays: Number(row.min_notice_days),
  allowsHalfDay: Boolean(row.allows_half_day),
  allowsNegativeBalance: Boolean(row.allows_negative_balance),
  requiresAttachment: Boolean(row.requires_attachment),
  attachmentHint: row.attachment_hint,

  genderRestriction: row.gender_restriction,
  colorHex: row.color_hex,
  sortOrder: row.sort_order,
  isActive: Boolean(row.is_active),
  legalBasis: row.legal_basis,

  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ================================================================== *
 *  GET /api/leave-types
 *  Query: ?activeOnly=true  ?category=
 * ================================================================== */
export const listLeaveTypes = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';

  const where = ['deleted_at IS NULL'];
  const params = [];

  if (activeOnly) where.push('is_active = 1');
  if (req.query.category) {
    where.push('category = ?');
    params.push(req.query.category);
  }

  const [rows] = await pool.query(
    `SELECT * FROM leave_types
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, code ASC`,
    params
  );

  return ok(res, { leaveTypes: rows.map(mapLeaveType) });
});

/* ================================================================== *
 *  GET /api/leave-types/:id
 * ================================================================== */
export const getLeaveType = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT * FROM leave_types WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!rows[0]) throw new AppError('Leave type not found.', 404, 'NOT_FOUND');

  // Live count of applications using this type — helps the admin before deletion
  const [usage] = await pool.query(
    `SELECT COUNT(*) AS applications_count
       FROM leave_applications
      WHERE leave_type_id = ? AND deleted_at IS NULL`,
    [id]
  );

  return ok(res, {
    leaveType: {
      ...mapLeaveType(rows[0]),
      applicationsCount: Number(usage[0].applications_count),
    },
  });
});

/* ================================================================== *
 *  POST /api/leave-types
 * ================================================================== */
export const createLeaveType = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'code',         type: 'string', required: true, min: 2, max: 20 },
    { name: 'name',         type: 'string', required: true, min: 2, max: 120 },
    { name: 'shortName',    type: 'string', max: 40, nullable: true },
    { name: 'description',  type: 'string', max: 500, nullable: true },
    { name: 'category',     type: 'enum', enum: CATEGORIES, transform: (v) => v ?? 'special' },

    { name: 'isPaid',       type: 'boolean', transform: (v) => v === undefined ? true : v },
    { name: 'isCredited',   type: 'boolean', transform: (v) => v === undefined ? true : v },
    { name: 'isEncashable', type: 'boolean', transform: (v) => v ?? false },

    { name: 'accrualMethod', type: 'enum', enum: ACCRUAL_METHODS,
      transform: (v) => v ?? 'manual_only' },
    { name: 'accrualAmount', type: 'number', min: 0, max: 365,
      transform: (v) => v === undefined ? 0 : v },
    { name: 'maxBalanceCap', type: 'number', min: 0, max: 9999, nullable: true },

    { name: 'maxDaysPerRequest', type: 'number', min: 0.5, max: 365, nullable: true },
    { name: 'maxDaysPerYear',    type: 'number', min: 0.5, max: 365, nullable: true },
    { name: 'minNoticeDays',     type: 'int', min: 0, max: 90,
      transform: (v) => v === undefined ? 0 : v },
    { name: 'allowsHalfDay',     type: 'boolean', transform: (v) => v === undefined ? true : v },
    { name: 'allowsNegativeBalance', type: 'boolean', transform: (v) => v ?? false },
    { name: 'requiresAttachment', type: 'boolean', transform: (v) => v ?? false },
    { name: 'attachmentHint',    type: 'string', max: 200, nullable: true },

    { name: 'genderRestriction', type: 'enum', enum: ['Male', 'Female'], nullable: true },
    { name: 'colorHex',          type: 'string', max: 7, nullable: true,
      pattern: /^#[0-9a-fA-F]{6}$/, message: 'Use a hex color like #3b82f6.' },
    { name: 'sortOrder',         type: 'int', min: 0, max: 9999,
      transform: (v) => v === undefined ? 100 : v },
    { name: 'isActive',          type: 'boolean', transform: (v) => v === undefined ? true : v },
    { name: 'legalBasis',        type: 'string', max: 255, nullable: true },
  ]);

  const [result] = await pool.query(
    `INSERT INTO leave_types
       (code, name, short_name, description, category,
        is_paid, is_credited, is_encashable,
        accrual_method, accrual_amount, max_balance_cap,
        max_days_per_request, max_days_per_year, min_notice_days,
        allows_half_day, allows_negative_balance,
        requires_attachment, attachment_hint,
        gender_restriction, color_hex, sort_order, is_active, legal_basis,
        created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.code.toUpperCase(), body.name, body.shortName ?? null, body.description ?? null,
      body.category,
      body.isPaid ? 1 : 0, body.isCredited ? 1 : 0, body.isEncashable ? 1 : 0,
      body.accrualMethod, body.accrualAmount, body.maxBalanceCap ?? null,
      body.maxDaysPerRequest ?? null, body.maxDaysPerYear ?? null, body.minNoticeDays,
      body.allowsHalfDay ? 1 : 0, body.allowsNegativeBalance ? 1 : 0,
      body.requiresAttachment ? 1 : 0, body.attachmentHint ?? null,
      body.genderRestriction ?? null, body.colorHex ?? '#3b82f6',
      body.sortOrder, body.isActive ? 1 : 0, body.legalBasis ?? null,
      req.user.id, req.user.id,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [result.insertId]);
  return ok(res, { leaveType: mapLeaveType(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/leave-types/:id
 * ================================================================== */
export const updateLeaveType = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'code',         type: 'string', min: 2, max: 20 },
    { name: 'name',         type: 'string', min: 2, max: 120 },
    { name: 'shortName',    type: 'string', max: 40, nullable: true },
    { name: 'description',  type: 'string', max: 500, nullable: true },
    { name: 'category',     type: 'enum', enum: CATEGORIES },
    { name: 'isPaid',       type: 'boolean' },
    { name: 'isCredited',   type: 'boolean' },
    { name: 'isEncashable', type: 'boolean' },
    { name: 'accrualMethod', type: 'enum', enum: ACCRUAL_METHODS },
    { name: 'accrualAmount', type: 'number', min: 0, max: 365 },
    { name: 'maxBalanceCap', type: 'number', min: 0, max: 9999, nullable: true },
    { name: 'maxDaysPerRequest', type: 'number', min: 0.5, max: 365, nullable: true },
    { name: 'maxDaysPerYear',    type: 'number', min: 0.5, max: 365, nullable: true },
    { name: 'minNoticeDays',     type: 'int', min: 0, max: 90 },
    { name: 'allowsHalfDay',     type: 'boolean' },
    { name: 'allowsNegativeBalance', type: 'boolean' },
    { name: 'requiresAttachment', type: 'boolean' },
    { name: 'attachmentHint',    type: 'string', max: 200, nullable: true },
    { name: 'genderRestriction', type: 'enum', enum: ['Male', 'Female'], nullable: true },
    { name: 'colorHex',          type: 'string', max: 7, nullable: true,
      pattern: /^#[0-9a-fA-F]{6}$/, message: 'Use a hex color like #3b82f6.' },
    { name: 'sortOrder',         type: 'int', min: 0, max: 9999 },
    { name: 'isActive',          type: 'boolean' },
    { name: 'legalBasis',        type: 'string', max: 255, nullable: true },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  const columnMap = {
    code: 'code', name: 'name', shortName: 'short_name', description: 'description',
    category: 'category',
    isPaid: 'is_paid', isCredited: 'is_credited', isEncashable: 'is_encashable',
    accrualMethod: 'accrual_method', accrualAmount: 'accrual_amount',
    maxBalanceCap: 'max_balance_cap',
    maxDaysPerRequest: 'max_days_per_request', maxDaysPerYear: 'max_days_per_year',
    minNoticeDays: 'min_notice_days',
    allowsHalfDay: 'allows_half_day', allowsNegativeBalance: 'allows_negative_balance',
    requiresAttachment: 'requires_attachment', attachmentHint: 'attachment_hint',
    genderRestriction: 'gender_restriction',
    colorHex: 'color_hex', sortOrder: 'sort_order',
    isActive: 'is_active', legalBasis: 'legal_basis',
  };

  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(body)) {
    sets.push(`${columnMap[key]} = ?`);
    if (typeof value === 'boolean') params.push(value ? 1 : 0);
    else if (key === 'code' && typeof value === 'string') params.push(value.toUpperCase());
    else params.push(value);
  }
  sets.push('updated_by = ?');
  params.push(req.user.id);
  params.push(id);

  const [result] = await pool.query(
    `UPDATE leave_types SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Leave type not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [id]);
  return ok(res, { leaveType: mapLeaveType(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/leave-types/:id  (soft)
 *  Blocks deletion if any application references this type.
 * ================================================================== */
export const deleteLeaveType = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [usage] = await pool.query(
    `SELECT COUNT(*) AS n FROM leave_applications
      WHERE leave_type_id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (Number(usage[0].n) > 0) {
    throw new AppError(
      'Cannot delete: leave applications already reference this type. ' +
      'Deactivate it instead.',
      409, 'IN_USE', { applicationsCount: Number(usage[0].n) }
    );
  }

  const [result] = await pool.query(
    `UPDATE leave_types
        SET deleted_at = NOW(), is_active = 0, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [req.user.id, id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Leave type not found.', 404, 'NOT_FOUND');
  }

  return ok(res, { message: 'Leave type deleted.' });
});