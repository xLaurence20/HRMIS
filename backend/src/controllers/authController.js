import { pool } from '../config/db.js';
import { env, refreshTtlMs } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, getClientIp, getUserAgent } from '../utils/request.js';
import { signAccessToken } from '../utils/tokens.js';
import { hashPassword, verifyPassword, DUMMY_HASH, assertPasswordPolicy } from '../utils/password.js';
import { getPermissionList, invalidatePermissionCache } from '../services/permissionService.js';
import {
  issueRefreshToken, rotateRefreshToken, revokeRefreshToken,
  revokeAllUserSessions, recordLoginAttempt,
  registerFailedLogin, clearFailedLogins,
} from '../services/authService.js';

/* ------------------------------------------------------------------ *
 *  Cookie helpers
 * ------------------------------------------------------------------ */
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.IS_PROD,
  sameSite: 'strict',
  path: env.REFRESH_COOKIE_PATH,
  maxAge: refreshTtlMs,
});

const setRefreshCookie = (res, rawToken) =>
  res.cookie(env.REFRESH_COOKIE_NAME, rawToken, cookieOptions());

const clearRefreshCookie = (res) =>
  res.clearCookie(env.REFRESH_COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

/* ------------------------------------------------------------------ *
 *  Shape the API user payload
 * ------------------------------------------------------------------ */
async function buildSessionPayload(user) {
  const permissions = await getPermissionList(user.role_id);
  return {
    accessToken: signAccessToken(user),
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      roleCode: user.role_code,
      roleName: user.role_name,
      profileCompleted: Boolean(user.profile_completed),
      mustChangePassword: Boolean(user.must_change_password),
    },
    permissions,
  };
}

/* ================================================================== *
 *  POST /api/auth/login
 * ================================================================== */
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!username || !password) {
    throw new AppError('Username and password are required.', 400, 'VALIDATION_ERROR');
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.status,
            u.role_id, u.profile_completed, u.must_change_password,
            u.failed_login_attempts, u.locked_until, u.deleted_at,
            r.code AS role_code, r.role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE (u.username = ? OR u.email = ?)
      LIMIT 1`,
    [username, username]
  );

  const user = rows[0];

  // --- Always run a bcrypt comparison to equalise response timing ---
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const passwordMatches = await verifyPassword(password, hashToCheck);

  if (!user || user.deleted_at) {
    await recordLoginAttempt({
      userId: null, usernameTry: username, ip, userAgent,
      success: false, failReason: 'USER_NOT_FOUND',
    });
    throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await recordLoginAttempt({
      userId: user.id, usernameTry: username, ip, userAgent,
      success: false, failReason: 'ACCOUNT_LOCKED',
    });
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    throw new AppError(
      `Account locked due to repeated failed attempts. Try again in ${mins} minute(s).`,
      423, 'ACCOUNT_LOCKED'
    );
  }

  if (!passwordMatches) {
    const { locked } = await registerFailedLogin(user.id);
    await recordLoginAttempt({
      userId: user.id, usernameTry: username, ip, userAgent,
      success: false, failReason: locked ? 'ACCOUNT_LOCKED' : 'BAD_PASSWORD',
    });
    throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'active') {
    await recordLoginAttempt({
      userId: user.id, usernameTry: username, ip, userAgent,
      success: false, failReason: `STATUS_${user.status.toUpperCase()}`,
    });
    throw new AppError(
      `Your account is ${user.status}. Please contact the administrator.`,
      403, 'ACCOUNT_INACTIVE'
    );
  }

  await clearFailedLogins(user.id, ip);
  await recordLoginAttempt({
    userId: user.id, usernameTry: username, ip, userAgent, success: true,
  });

  // Single active session per user: revoke any lingering tokens first.
  await revokeAllUserSessions(user.id, 'new_login');

  const refresh = await issueRefreshToken({ userId: user.id, ip, userAgent });
  setRefreshCookie(res, refresh.rawToken);

  const payload = await buildSessionPayload(user);
  return ok(res, payload);
});

/* ================================================================== *
 *  POST /api/auth/refresh   (silent session renewal)
 * ================================================================== */
export const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!rawToken) throw new AppError('No active session.', 401, 'NO_REFRESH_TOKEN');

  const { user, refresh: next } = await rotateRefreshToken({
    rawToken,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  setRefreshCookie(res, next.rawToken);
  const payload = await buildSessionPayload(user);
  return ok(res, payload);
});

/* ================================================================== *
 *  POST /api/auth/logout
 * ================================================================== */
export const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  await revokeRefreshToken(rawToken, 'logout');
  clearRefreshCookie(res);
  return ok(res, { message: 'Signed out successfully.' });
});

/* ================================================================== *
 *  GET /api/auth/me
 * ================================================================== */
export const me = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.status, u.role_id,
            u.profile_completed, u.must_change_password, u.last_login_at,
            r.code AS role_code, r.role_name, r.authority_level,
            p.first_name, p.middle_name, p.last_name, p.extension_name,
            p.phone, p.department_id, p.position, p.avatar_url
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [req.user.id]
  );

  const row = rows[0];
  if (!row) throw new AppError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');

  const permissions = await getPermissionList(row.role_id);

  return ok(res, {
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      status: row.status,
      roleId: row.role_id,
      roleCode: row.role_code,
      roleName: row.role_name,
      authorityLevel: row.authority_level,
      profileCompleted: Boolean(row.profile_completed),
      mustChangePassword: Boolean(row.must_change_password),
      lastLoginAt: row.last_login_at,
    },
    profile: {
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      extensionName: row.extension_name,
      phone: row.phone,
      departmentId: row.department_id,
      position: row.position,
      avatarUrl: row.avatar_url,
    },
    permissions,
  });
});

/* ================================================================== *
 *  GET /api/auth/permissions   (lightweight refresh for the UI)
 * ================================================================== */
export const myPermissions = asyncHandler(async (req, res) => {
  const permissions = await getPermissionList(req.user.roleId);
  return ok(res, { permissions });
});

/* ================================================================== *
 *  POST /api/auth/change-password
 * ================================================================== */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    throw new AppError('Current and new password are required.', 400, 'VALIDATION_ERROR');
  }

  const policyErrors = assertPasswordPolicy(newPassword);
  if (policyErrors.length) {
    throw new AppError('Password does not meet the security policy.', 400,
      'WEAK_PASSWORD', { rules: policyErrors });
  }

  const [rows] = await pool.query(
    'SELECT password_hash FROM users WHERE id = ?',
    [req.user.id]
  );
  const matches = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!matches) throw new AppError('Current password is incorrect.', 401, 'BAD_PASSWORD');

  const same = await verifyPassword(newPassword, rows[0].password_hash);
  if (same) throw new AppError('New password must differ from the current one.', 400, 'SAME_PASSWORD');

  const hash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE users
        SET password_hash = ?, must_change_password = 0,
            password_changed_at = NOW(), failed_login_attempts = 0, locked_until = NULL
      WHERE id = ?`,
    [hash, req.user.id]
  );

  // Force re-authentication everywhere else.
  await revokeAllUserSessions(req.user.id, 'password_change');
  clearRefreshCookie(res);

  return ok(res, { message: 'Password updated. Please sign in again.' });
});