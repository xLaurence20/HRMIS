import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid } from '../utils/validate.js';

/* ------------------------------------------------------------------ *
 *  Mapper — snake_case (DB) -> camelCase (API)
 * ------------------------------------------------------------------ */
const mapDepartment = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  shortName: row.short_name,
  parentId: row.parent_id,
  officeType: row.office_type,
  headEmployeeId: row.head_employee_id,
  headEmployeeName: row.head_employee_name ?? null,
  costCenter: row.cost_center,
  location: row.location,
  sortOrder: row.sort_order,
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  // Aggregate fields when present
  employeeCount: row.employee_count !== undefined ? Number(row.employee_count) : undefined,
  childCount: row.child_count !== undefined ? Number(row.child_count) : undefined,
});

/* ================================================================== *
 *  GET /api/departments
 *  Query: ?activeOnly=true  (default true)
 *         ?parentId=<id>    (filter direct children)
 * ================================================================== */
export const listDepartments = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';
  const parentFilter =
    req.query.parentId !== undefined && req.query.parentId !== ''
      ? Number(req.query.parentId)
      : undefined;

  const where = ['d.deleted_at IS NULL'];
  const params = [];

  if (activeOnly) where.push('d.is_active = 1');

  if (parentFilter === 0) {
    where.push('d.parent_id IS NULL');
  } else if (Number.isInteger(parentFilter)) {
    where.push('d.parent_id = ?');
    params.push(parentFilter);
  }

  const [rows] = await pool.query(
    `SELECT d.*,
            h.full_name AS head_employee_name,
            (SELECT COUNT(*) FROM employees e
              WHERE e.department_id = d.id AND e.deleted_at IS NULL) AS employee_count,
            (SELECT COUNT(*) FROM departments c
              WHERE c.parent_id = d.id AND c.deleted_at IS NULL) AS child_count
       FROM departments d
       LEFT JOIN employees h ON h.id = d.head_employee_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.sort_order ASC, d.name ASC`,
    params
  );

  return ok(res, { departments: rows.map(mapDepartment) });
});

/* ================================================================== *
 *  GET /api/departments/tree
 *  Returns a nested tree: { id, ..., children: [...] }
 * ================================================================== */
export const getDepartmentTree = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT d.*,
            h.full_name AS head_employee_name,
            (SELECT COUNT(*) FROM employees e
              WHERE e.department_id = d.id AND e.deleted_at IS NULL) AS employee_count
       FROM departments d
       LEFT JOIN employees h ON h.id = d.head_employee_id
      WHERE d.deleted_at IS NULL
      ORDER BY d.sort_order ASC, d.name ASC`
  );

  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, { ...mapDepartment(row), children: [] });
  }

  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return ok(res, { tree: roots });
});

/* ================================================================== *
 *  GET /api/departments/:id
 * ================================================================== */
export const getDepartment = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid department id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    `SELECT d.*,
            h.full_name AS head_employee_name,
            (SELECT COUNT(*) FROM employees e
              WHERE e.department_id = d.id AND e.deleted_at IS NULL) AS employee_count
       FROM departments d
       LEFT JOIN employees h ON h.id = d.head_employee_id
      WHERE d.id = ? AND d.deleted_at IS NULL`,
    [id]
  );

  if (!rows[0]) throw new AppError('Department not found.', 404, 'NOT_FOUND');

  const [children] = await pool.query(
    `SELECT id, code, name, office_type, is_active
       FROM departments
      WHERE parent_id = ? AND deleted_at IS NULL
      ORDER BY sort_order, name`,
    [id]
  );

  return ok(res, {
    department: mapDepartment(rows[0]),
    children: children.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      officeType: c.office_type,
      isActive: Boolean(c.is_active),
    })),
  });
});

/* ================================================================== *
 *  POST /api/departments
 * ================================================================== */
export const createDepartment = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    { name: 'code',         type: 'string', required: true, min: 2, max: 30,
                            pattern: /^[A-Z0-9-]+$/, message: 'Use A-Z, 0-9, or hyphens.' },
    { name: 'name',         type: 'string', required: true, min: 2, max: 150 },
    { name: 'shortName',    type: 'string', max: 50,  nullable: true },
    { name: 'parentId',     type: 'int',    min: 1,   nullable: true },
    { name: 'officeType',   type: 'enum',   enum: ['department','division','section','unit'],
                            transform: (v) => v ?? 'department' },
    { name: 'costCenter',   type: 'string', max: 50,  nullable: true },
    { name: 'location',     type: 'string', max: 150, nullable: true },
    { name: 'sortOrder',    type: 'int',    min: 0,   max: 9999, transform: (v) => v ?? 0 },
    { name: 'isActive',     type: 'boolean', transform: (v) => (v === undefined ? true : v) },
  ]);

  // Guard: parent must exist and be active
  if (body.parentId) {
    const [parent] = await pool.query(
      'SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL',
      [body.parentId]
    );
    if (!parent[0]) {
      throw new AppError('Parent department not found.', 400, 'VALIDATION_ERROR', {
        fields: [{ field: 'parentId', message: 'Unknown parent department.' }],
      });
    }
  }

  const [result] = await pool.query(
    `INSERT INTO departments
       (code, name, short_name, parent_id, office_type,
        cost_center, location, sort_order, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.code, body.name, body.shortName ?? null, body.parentId ?? null,
      body.officeType, body.costCenter ?? null, body.location ?? null,
      body.sortOrder, body.isActive ? 1 : 0, req.user.id, req.user.id,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [result.insertId]);
  return ok(res, { department: mapDepartment(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/departments/:id
 * ================================================================== */
export const updateDepartment = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid department id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'code',       type: 'string', min: 2, max: 30,
                          pattern: /^[A-Z0-9-]+$/, message: 'Use A-Z, 0-9, or hyphens.' },
    { name: 'name',       type: 'string', min: 2, max: 150 },
    { name: 'shortName',  type: 'string', max: 50, nullable: true },
    { name: 'parentId',   type: 'int', min: 1, nullable: true },
    { name: 'officeType', type: 'enum', enum: ['department','division','section','unit'] },
    { name: 'costCenter', type: 'string', max: 50, nullable: true },
    { name: 'location',   type: 'string', max: 150, nullable: true },
    { name: 'sortOrder',  type: 'int', min: 0, max: 9999 },
    { name: 'isActive',   type: 'boolean' },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  // Guard: cannot set self as parent (prevents a trivial cycle)
  if (body.parentId === id) {
    throw new AppError('A department cannot be its own parent.', 400, 'VALIDATION_ERROR', {
      fields: [{ field: 'parentId', message: 'Cannot be self.' }],
    });
  }

  // Guard: cannot create a cycle (walk up the proposed parent chain)
  if (body.parentId) {
    const [chain] = await pool.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM departments WHERE id = ?
         UNION ALL
         SELECT d.id, d.parent_id
           FROM departments d
           JOIN ancestors a ON d.id = a.parent_id
       )
       SELECT id FROM ancestors WHERE id = ?`,
      [body.parentId, id]
    );
    if (chain.length) {
      throw new AppError('This move would create a circular hierarchy.', 400, 'VALIDATION_ERROR', {
        fields: [{ field: 'parentId', message: 'Would create a cycle.' }],
      });
    }
  }

  const columnMap = {
    code: 'code',
    name: 'name',
    shortName: 'short_name',
    parentId: 'parent_id',
    officeType: 'office_type',
    costCenter: 'cost_center',
    location: 'location',
    sortOrder: 'sort_order',
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
    `UPDATE departments SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Department not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
  return ok(res, { department: mapDepartment(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/departments/:id  (soft)
 *  Guard: no active children, no assigned employees.
 * ================================================================== */
export const deleteDepartment = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid department id.', 400, 'VALIDATION_ERROR');

  await withTransaction(async (conn) => {
    const [dept] = await conn.query(
      'SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!dept[0]) throw new AppError('Department not found.', 404, 'NOT_FOUND');

    const [children] = await conn.query(
      'SELECT COUNT(*) AS n FROM departments WHERE parent_id = ? AND deleted_at IS NULL',
      [id]
    );
    if (Number(children[0].n) > 0) {
      throw new AppError(
        'Cannot delete: this department has sub-units. Reassign or delete them first.',
        409, 'HAS_CHILDREN'
      );
    }

    const [emps] = await conn.query(
      'SELECT COUNT(*) AS n FROM employees WHERE department_id = ? AND deleted_at IS NULL',
      [id]
    );
    if (Number(emps[0].n) > 0) {
      throw new AppError(
        'Cannot delete: employees are still assigned to this department.',
        409, 'HAS_EMPLOYEES'
      );
    }

    await conn.query(
      'UPDATE departments SET deleted_at = NOW(), updated_by = ? WHERE id = ?',
      [req.user.id, id]
    );
  });

  return ok(res, { message: 'Department deleted.' });
});

/* ================================================================== *
 *  PUT /api/departments/:id/head
 *  Body: { employeeId: number | null }
 * ================================================================== */
export const setDepartmentHead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const employeeId = req.body?.employeeId;

  if (!Number.isInteger(id)) throw new AppError('Invalid department id.', 400, 'VALIDATION_ERROR');
  if (employeeId !== null && !Number.isInteger(Number(employeeId))) {
    throw new AppError('employeeId must be an integer or null.', 400, 'VALIDATION_ERROR');
  }

  await withTransaction(async (conn) => {
    const [dept] = await conn.query(
      'SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!dept[0]) throw new AppError('Department not found.', 404, 'NOT_FOUND');

    if (employeeId) {
      const [emp] = await conn.query(
        'SELECT id, department_id FROM employees WHERE id = ? AND deleted_at IS NULL',
        [employeeId]
      );
      if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
      // Head doesn't have to belong to the department, but warn if not.
      // (Common in government where an OIC heads a unit they aren't assigned to.)
    }

    await conn.query(
      'UPDATE departments SET head_employee_id = ?, updated_by = ? WHERE id = ?',
      [employeeId ?? null, req.user.id, id]
    );
  });

  return ok(res, { message: 'Department head updated.' });
});