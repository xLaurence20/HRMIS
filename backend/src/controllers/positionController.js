import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination, parseSort } from '../utils/validate.js';

const mapPosition = (row) => ({
  id: row.id,
  code: row.code,
  title: row.title,
  departmentId: row.department_id,
  departmentName: row.department_name ?? null,
  salaryGrade: row.salary_grade,
  step: row.step,
  positionClass: row.position_class,
  level: row.level,
  isPlantilla: Boolean(row.is_plantilla),
  isSupervisory: Boolean(row.is_supervisory),
  isTeaching: Boolean(row.is_teaching),
  monthlyRate: row.monthly_rate !== null ? Number(row.monthly_rate) : null,
  isActive: Boolean(row.is_active),
  filledCount: row.filled_count !== undefined ? Number(row.filled_count) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SORTABLE = ['code', 'title', 'salary_grade', 'created_at'];

/* ================================================================== *
 *  GET /api/positions
 * ================================================================== */
export const listPositions = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const orderBy = parseSort(req.query, SORTABLE, 'salary_grade DESC, code ASC');
  const activeOnly = req.query.activeOnly !== 'false';

  const where = ['p.deleted_at IS NULL'];
  const params = [];

  if (activeOnly) where.push('p.is_active = 1');

  if (req.query.departmentId) {
    where.push('p.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.level) {
    where.push('p.level = ?');
    params.push(req.query.level);
  }
  if (req.query.isSupervisory === 'true') where.push('p.is_supervisory = 1');
  if (req.query.isPlantilla === 'true') where.push('p.is_plantilla = 1');
  if (req.query.search) {
    where.push('(p.code LIKE ? OR p.title LIKE ?)');
    const q = `%${req.query.search}%`;
    params.push(q, q);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM positions p ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT p.*, d.name AS department_name,
            (SELECT COUNT(*) FROM employees e
              WHERE e.position_id = p.id AND e.deleted_at IS NULL) AS filled_count
       FROM positions p
       LEFT JOIN departments d ON d.id = p.department_id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    positions: rows.map(mapPosition),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/positions/:id
 * ================================================================== */
export const getPosition = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid position id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    `SELECT p.*, d.name AS department_name
       FROM positions p
       LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.id = ? AND p.deleted_at IS NULL`,
    [id]
  );

  if (!rows[0]) throw new AppError('Position not found.', 404, 'NOT_FOUND');

  const [holders] = await pool.query(
    `SELECT e.id, e.employee_number, e.full_name, e.employment_status
       FROM employees e
      WHERE e.position_id = ? AND e.deleted_at IS NULL
      ORDER BY e.full_name`,
    [id]
  );

  return ok(res, {
    position: mapPosition(rows[0]),
    holders: holders.map((h) => ({
      id: h.id,
      employeeNumber: h.employee_number,
      fullName: h.full_name,
      employmentStatus: h.employment_status,
    })),
  });
});

/* ================================================================== *
 *  POST /api/positions
 * ================================================================== */
export const createPosition = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'code',           type: 'string', required: true, min: 2, max: 40 },
    { name: 'title',          type: 'string', required: true, min: 2, max: 200 },
    { name: 'departmentId',   type: 'int', min: 1, nullable: true },
    { name: 'salaryGrade',    type: 'int', min: 1, max: 33, nullable: true },
    { name: 'step',           type: 'int', min: 1, max: 8, transform: (v) => v ?? 1 },
    { name: 'positionClass',  type: 'enum',
      enum: ['Executive/Managerial','Professional','Sub-professional','Rank-and-File','Legislative'],
      nullable: true },
    { name: 'level',          type: 'enum',
      enum: ['1st Level','2nd Level','3rd Level'], nullable: true },
    { name: 'isPlantilla',    type: 'boolean', transform: (v) => (v === undefined ? true : v) },
    { name: 'isSupervisory',  type: 'boolean', transform: (v) => v ?? false },
    { name: 'isTeaching',     type: 'boolean', transform: (v) => v ?? false },
    { name: 'monthlyRate',    type: 'number', min: 0, nullable: true },
    { name: 'isActive',       type: 'boolean', transform: (v) => (v === undefined ? true : v) },
  ]);

  const [result] = await pool.query(
    `INSERT INTO positions
       (code, title, department_id, salary_grade, step, position_class, level,
        is_plantilla, is_supervisory, is_teaching, monthly_rate, is_active,
        created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.code, body.title, body.departmentId ?? null,
      body.salaryGrade ?? null, body.step, body.positionClass ?? null,
      body.level ?? null, body.isPlantilla ? 1 : 0, body.isSupervisory ? 1 : 0,
      body.isTeaching ? 1 : 0, body.monthlyRate ?? null, body.isActive ? 1 : 0,
      req.user.id, req.user.id,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM positions WHERE id = ?', [result.insertId]);
  return ok(res, { position: mapPosition(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/positions/:id
 * ================================================================== */
export const updatePosition = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid position id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'code',          type: 'string', min: 2, max: 40 },
    { name: 'title',         type: 'string', min: 2, max: 200 },
    { name: 'departmentId',  type: 'int', min: 1, nullable: true },
    { name: 'salaryGrade',   type: 'int', min: 1, max: 33, nullable: true },
    { name: 'step',          type: 'int', min: 1, max: 8 },
    { name: 'positionClass', type: 'enum',
      enum: ['Executive/Managerial','Professional','Sub-professional','Rank-and-File','Legislative'],
      nullable: true },
    { name: 'level',         type: 'enum',
      enum: ['1st Level','2nd Level','3rd Level'], nullable: true },
    { name: 'isPlantilla',   type: 'boolean' },
    { name: 'isSupervisory', type: 'boolean' },
    { name: 'isTeaching',    type: 'boolean' },
    { name: 'monthlyRate',   type: 'number', min: 0, nullable: true },
    { name: 'isActive',      type: 'boolean' },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  const columnMap = {
    code: 'code', title: 'title', departmentId: 'department_id',
    salaryGrade: 'salary_grade', step: 'step', positionClass: 'position_class',
    level: 'level', isPlantilla: 'is_plantilla', isSupervisory: 'is_supervisory',
    isTeaching: 'is_teaching', monthlyRate: 'monthly_rate', isActive: 'is_active',
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
    `UPDATE positions SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Position not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query('SELECT * FROM positions WHERE id = ?', [id]);
  return ok(res, { position: mapPosition(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/positions/:id  (soft)
 *  Guard: no active employees holding this position.
 * ================================================================== */
export const deletePosition = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid position id.', 400, 'VALIDATION_ERROR');

  await withTransaction(async (conn) => {
    const [pos] = await conn.query(
      'SELECT id FROM positions WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!pos[0]) throw new AppError('Position not found.', 404, 'NOT_FOUND');

    const [holders] = await conn.query(
      'SELECT COUNT(*) AS n FROM employees WHERE position_id = ? AND deleted_at IS NULL',
      [id]
    );
    if (Number(holders[0].n) > 0) {
      throw new AppError(
        'Cannot delete: employees are still assigned to this position.',
        409, 'HAS_HOLDERS'
      );
    }

    await conn.query(
      'UPDATE positions SET deleted_at = NOW(), updated_by = ? WHERE id = ?',
      [req.user.id, id]
    );
  });

  return ok(res, { message: 'Position deleted.' });
});