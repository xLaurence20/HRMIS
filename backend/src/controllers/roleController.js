import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { invalidatePermissionCache } from '../services/permissionService.js';

const PROTECTED_PERMISSION = 'roles.manage_permissions';

/* ================================================================== *
 *  GET /api/roles
 *  Returns every role, its permission ids, and the full permission
 *  catalogue (for building the admin matrix).
 * ================================================================== */
export const listRoles = asyncHandler(async (_req, res) => {
  const [roles] = await pool.query(
    `SELECT r.id, r.code, r.role_name, r.description,
            r.authority_level, r.is_system,
            (SELECT COUNT(*) FROM users u
              WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
       FROM roles r
      ORDER BY r.authority_level DESC, r.id ASC`
  );

  const [grants] = await pool.query(
    'SELECT role_id, permission_id FROM role_permissions'
  );

  const [permissions] = await pool.query(
    `SELECT id, permission_name, module, description
       FROM permissions
      ORDER BY module ASC, permission_name ASC`
  );

  const byRole = new Map();
  for (const g of grants) {
    if (!byRole.has(g.role_id)) byRole.set(g.role_id, []);
    byRole.get(g.role_id).push(g.permission_id);
  }

  return ok(res, {
    roles: roles.map((r) => ({
      id: r.id,
      code: r.code,
      roleName: r.role_name,
      description: r.description,
      authorityLevel: r.authority_level,
      isSystem: Boolean(r.is_system),
      userCount: Number(r.user_count),
      permissionIds: (byRole.get(r.id) ?? []).sort((a, b) => a - b),
    })),
    permissions: permissions.map((p) => ({
      id: p.id,
      permissionName: p.permission_name,
      module: p.module,
      description: p.description,
    })),
  });
});

/* ================================================================== *
 *  GET /api/roles/:roleId
 * ================================================================== */
export const getRole = asyncHandler(async (req, res) => {
  const roleId = Number(req.params.roleId);
  if (!Number.isInteger(roleId)) throw new AppError('Invalid role id.', 400, 'VALIDATION_ERROR');

  const [roles] = await pool.query(
    `SELECT id, code, role_name, description, authority_level, is_system
       FROM roles WHERE id = ?`,
    [roleId]
  );
  if (!roles[0]) throw new AppError('Role not found.', 404, 'ROLE_NOT_FOUND');

  const [perms] = await pool.query(
    `SELECT p.id, p.permission_name, p.module, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.module, p.permission_name`,
    [roleId]
  );

  const r = roles[0];
  return ok(res, {
    role: {
      id: r.id,
      code: r.code,
      roleName: r.role_name,
      description: r.description,
      authorityLevel: r.authority_level,
      isSystem: Boolean(r.is_system),
      permissions: perms.map((p) => ({
        id: p.id,
        permissionName: p.permission_name,
        module: p.module,
        description: p.description,
      })),
    },
  });
});

/* ================================================================== *
 *  PUT /api/roles/:roleId/permissions
 *  Body: { permissionIds: number[] }
 *  Replaces the role's permission set transactionally.
 *
 *  (Maps to the spec's "POST /api/roles/permissions" — PUT with the
 *   role in the path is the REST-correct form of the same operation.)
 * ================================================================== */
export const updateRolePermissions = asyncHandler(async (req, res) => {
  const roleId = Number(req.params.roleId);
  const { permissionIds } = req.body ?? {};

  if (!Number.isInteger(roleId)) {
    throw new AppError('Invalid role id.', 400, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(permissionIds)) {
    throw new AppError('permissionIds must be an array.', 400, 'VALIDATION_ERROR');
  }

  const uniqueIds = [...new Set(permissionIds.map(Number))];
  if (uniqueIds.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new AppError('permissionIds must contain positive integers.', 400, 'VALIDATION_ERROR');
  }

  const result = await withTransaction(async (conn) => {
    // Lock the role row so two admins cannot race this edit.
    const [roleRows] = await conn.query(
      'SELECT id, code, is_system FROM roles WHERE id = ? FOR UPDATE',
      [roleId]
    );
    const role = roleRows[0];
    if (!role) throw new AppError('Role not found.', 404, 'ROLE_NOT_FOUND');

    // Validate that every supplied id exists.
    if (uniqueIds.length) {
      const [found] = await conn.query(
        'SELECT id FROM permissions WHERE id IN (?)',
        [uniqueIds]
      );
      if (found.length !== uniqueIds.length) {
        const foundSet = new Set(found.map((f) => f.id));
        const missing = uniqueIds.filter((id) => !foundSet.has(id));
        throw new AppError('One or more permissions do not exist.', 400,
          'VALIDATION_ERROR', { missingPermissionIds: missing });
      }
    }

    // ---- Lockout guard: never let the system lose all admins ----
    const [permRows] = await conn.query(
      'SELECT id FROM permissions WHERE permission_name = ?',
      [PROTECTED_PERMISSION]
    );
    const protectedId = permRows[0]?.id;

    if (protectedId && !uniqueIds.includes(protectedId)) {
      const [otherHolders] = await conn.query(
        `SELECT COUNT(DISTINCT rp.role_id) AS n
           FROM role_permissions rp
          WHERE rp.permission_id = ? AND rp.role_id <> ?`,
        [protectedId, roleId]
      );
      if (Number(otherHolders[0].n) === 0) {
        throw new AppError(
          'Cannot remove "roles.manage_permissions" — at least one role must retain it.',
          409, 'LOCKOUT_PREVENTED'
        );
      }
    }

    // ---- Replace the grant set ----
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

    if (uniqueIds.length) {
      const values = uniqueIds.map((pid) => [roleId, pid]);
      await conn.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
        [values]
      );
    }

    return { roleId, grantedCount: uniqueIds.length };
  });

  invalidatePermissionCache(roleId);

  const [permissionNames] = await pool.query(
    `SELECT p.permission_name
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.permission_name`,
    [roleId]
  );

  return ok(res, {
    roleId: result.roleId,
    grantedCount: result.grantedCount,
    permissions: permissionNames.map((p) => p.permission_name),
  });
});

/* ================================================================== *
 *  GET /api/roles/permissions/catalogue
 * ================================================================== */
export const listPermissions = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, permission_name, module, description
       FROM permissions
      ORDER BY module, permission_name`
  );

  // Group by module for the UI matrix.
  const grouped = rows.reduce((acc, p) => {
    (acc[p.module] ??= []).push({
      id: p.id,
      permissionName: p.permission_name,
      description: p.description,
    });
    return acc;
  }, {});

  return ok(res, {
    permissions: rows.map((p) => ({
      id: p.id,
      permissionName: p.permission_name,
      module: p.module,
      description: p.description,
    })),
    grouped,
  });
});