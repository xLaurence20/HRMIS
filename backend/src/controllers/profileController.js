import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { getPermissionList } from '../services/permissionService.js';

const FIELD_LIMITS = {
  firstName: 80,
  middleName: 80,
  lastName: 80,
  extensionName: 20,
  phone: 20,
  position: 150,
  avatarUrl: 255,
};

const trimOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function validateProfileInput(body) {
  const errors = [];

  const firstName = trimOrNull(body.firstName);
  const lastName = trimOrNull(body.lastName);

  if (!firstName) errors.push({ field: 'firstName', message: 'First name is required.' });
  if (!lastName)  errors.push({ field: 'lastName',  message: 'Last name is required.' });

  for (const [key, max] of Object.entries(FIELD_LIMITS)) {
    const value = trimOrNull(body[key]);
    if (value && value.length > max) {
      errors.push({ field: key, message: `Must be ${max} characters or fewer.` });
    }
  }

  const phone = trimOrNull(body.phone);
  if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) {
    errors.push({ field: 'phone', message: 'Enter a valid phone number.' });
  }

  const avatarUrl = trimOrNull(body.avatarUrl);
  if (avatarUrl && !/^https?:\/\/.+/i.test(avatarUrl)) {
    errors.push({ field: 'avatarUrl', message: 'Must be a valid http(s) URL.' });
  }

  let departmentId = null;
  if (body.departmentId !== undefined && body.departmentId !== null && body.departmentId !== '') {
    departmentId = Number(body.departmentId);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      errors.push({ field: 'departmentId', message: 'Invalid department.' });
    }
  }

  return {
    errors,
    value: {
      firstName,
      middleName: trimOrNull(body.middleName),
      lastName,
      extensionName: trimOrNull(body.extensionName),
      phone,
      departmentId,
      position: trimOrNull(body.position),
      avatarUrl,
    },
  };
}

/* ================================================================== *
 *  GET /api/profile/me
 * ================================================================== */
export const getMyProfile = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id AS user_id, u.username, u.email, u.status, u.profile_completed,
            u.must_change_password, u.last_login_at, u.created_at AS member_since,
            r.id AS role_id, r.code AS role_code, r.role_name, r.authority_level,
            p.id AS profile_id, p.first_name, p.middle_name, p.last_name,
            p.extension_name, p.phone, p.department_id, p.position, p.avatar_url,
            d.code AS department_code, d.name AS department_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN departments   d ON d.id = p.department_id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [req.user.id]
  );

  const row = rows[0];
  if (!row) throw new AppError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');

  const permissions = await getPermissionList(row.role_id);

  return ok(res, {
    user: {
      id: row.user_id,
      username: row.username,
      email: row.email,
      status: row.status,
      profileCompleted: Boolean(row.profile_completed),
      mustChangePassword: Boolean(row.must_change_password),
      lastLoginAt: row.last_login_at,
      memberSince: row.member_since,
    },
    profile: {
      id: row.profile_id,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      extensionName: row.extension_name,
      phone: row.phone,
      departmentId: row.department_id,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      position: row.position,
      avatarUrl: row.avatar_url,
    },
    role: {
      id: row.role_id,
      code: row.role_code,
      name: row.role_name,
      authorityLevel: row.authority_level,
    },
    permissions,
  });
});

/* ================================================================== *
 *  PUT /api/profile/setup
 *  Upserts the profile and flips users.profile_completed = 1.
 * ================================================================== */
export const setupProfile = asyncHandler(async (req, res) => {
  const { errors, value } = validateProfileInput(req.body ?? {});
  if (errors.length) {
    throw new AppError('Please correct the highlighted fields.', 400, 'VALIDATION_ERROR', { fields: errors });
  }

  await withTransaction(async (conn) => {
    if (value.departmentId) {
      const [dept] = await conn.query(
        'SELECT id FROM departments WHERE id = ? AND is_active = 1',
        [value.departmentId]
      );
      if (!dept[0]) {
        throw new AppError('Selected department does not exist.', 400, 'VALIDATION_ERROR', {
          fields: [{ field: 'departmentId', message: 'Unknown department.' }],
        });
      }
    }

    await conn.query(
      `INSERT INTO user_profiles
         (user_id, first_name, middle_name, last_name, extension_name,
          phone, department_id, position, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         first_name     = VALUES(first_name),
         middle_name    = VALUES(middle_name),
         last_name      = VALUES(last_name),
         extension_name = VALUES(extension_name),
         phone          = VALUES(phone),
         department_id  = VALUES(department_id),
         position       = VALUES(position),
         avatar_url     = VALUES(avatar_url)`,
      [
        req.user.id, value.firstName, value.middleName, value.lastName,
        value.extensionName, value.phone, value.departmentId,
        value.position, value.avatarUrl,
      ]
    );

    await conn.query(
      'UPDATE users SET profile_completed = 1 WHERE id = ?',
      [req.user.id]
    );
  });

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.profile_completed,
            p.first_name, p.middle_name, p.last_name, p.extension_name,
            p.phone, p.department_id, p.position, p.avatar_url
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ?`,
    [req.user.id]
  );
  const r = rows[0];

  return ok(res, {
    user: {
      id: r.id,
      username: r.username,
      email: r.email,
      profileCompleted: Boolean(r.profile_completed),
    },
    profile: {
      firstName: r.first_name,
      middleName: r.middle_name,
      lastName: r.last_name,
      extensionName: r.extension_name,
      phone: r.phone,
      departmentId: r.department_id,
      position: r.position,
      avatarUrl: r.avatar_url,
    },
  });
});

/* ================================================================== *
 *  GET /api/profile/departments   (populates the profile form select)
 * ================================================================== */
export const listDepartments = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, code, name FROM departments WHERE is_active = 1 ORDER BY name'
  );
  return ok(res, { departments: rows });
});