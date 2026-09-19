import { pool } from '../config/db.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

/**
 * Verifies the Bearer access token, loads a fresh user record from MySQL
 * (so role changes / suspensions take effect immediately), and attaches
 * `req.user`.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, 'NO_TOKEN');
  }
  const token = header.slice(7).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    throw new AppError('Your session has expired.', 401, code);
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.status, u.role_id,
            u.profile_completed, u.must_change_password,
            r.code AS role_code, r.role_name, r.authority_level
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [payload.sub]
  );

  const user = rows[0];
  if (!user) throw new AppError('Account not found', 401, 'ACCOUNT_NOT_FOUND');
  if (user.status !== 'active') {
    throw new AppError('Your account is not active.', 403, 'ACCOUNT_INACTIVE');
  }

  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    roleId: user.role_id,
    roleCode: user.role_code,
    roleName: user.role_name,
    authorityLevel: user.authority_level,
    profileCompleted: Boolean(user.profile_completed),
    mustChangePassword: Boolean(user.must_change_password),
  };

  next();
});

/** Blocks access until the user completes their profile. */
export const requireProfileComplete = (req, _res, next) => {
  if (!req.user?.profileCompleted) {
    return next(
      new AppError('Please complete your profile to continue.', 403, 'PROFILE_INCOMPLETE')
    );
  }
  next();
};