import { pool, withTransaction } from '../config/db.js';
import { env, refreshTtlMs } from '../config/env.js';
import { generateRefreshToken, hashToken, newUuid } from '../utils/tokens.js';
import { AppError } from '../utils/AppError.js';

/* ------------------------------------------------------------------ *
 *  Refresh-token lifecycle
 * ------------------------------------------------------------------ */

export async function issueRefreshToken({
  userId, familyId = null, ip, userAgent, conn = pool,
}) {
  const raw = generateRefreshToken();
  const tokenHash = hashToken(raw);
  const jti = newUuid();
  const family = familyId ?? newUuid();
  const expiresAt = new Date(Date.now() + refreshTtlMs);

  const [res] = await conn.query(
    `INSERT INTO refresh_tokens
       (user_id, jti, token_hash, family_id, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, jti, tokenHash, family, userAgent ?? null, ip ?? null, expiresAt]
  );

  return { rawToken: raw, tokenId: res.insertId, familyId: family, expiresAt };
}

/**
 * Rotate a refresh token.
 * - Unknown / expired token        -> 401
 * - Already-revoked token (reuse!) -> revoke the whole family, 401
 * - Valid                          -> revoke old, issue new in same family
 */
export async function rotateRefreshToken({ rawToken, ip, userAgent }) {
  const tokenHash = hashToken(rawToken);

  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at
         FROM refresh_tokens
        WHERE token_hash = ?
        FOR UPDATE`,
      [tokenHash]
    );

    const record = rows[0];
    if (!record) throw new AppError('Invalid session', 401, 'INVALID_REFRESH_TOKEN');

    if (record.revoked_at) {
      // Reuse of a rotated token ⇒ likely theft. Kill the entire lineage.
      await conn.query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW(), revoked_reason = 'reuse_detected'
          WHERE family_id = ? AND revoked_at IS NULL`,
        [record.family_id]
      );
      throw new AppError('Session expired. Please sign in again.', 401, 'REFRESH_REUSE_DETECTED');
    }

    if (new Date(record.expires_at) <= new Date()) {
      throw new AppError('Session expired. Please sign in again.', 401, 'REFRESH_TOKEN_EXPIRED');
    }

    const [userRows] = await conn.query(
  `SELECT u.id, u.username, u.email, u.status, u.role_id,
          u.profile_completed, u.must_change_password,
          r.code AS role_code, r.role_name
     FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ? AND u.deleted_at IS NULL`,
  [record.user_id]
);
    const user = userRows[0];
    if (!user) throw new AppError('Account no longer exists', 401, 'ACCOUNT_GONE');
    if (user.status !== 'active')
      throw new AppError('Your account is not active.', 403, 'ACCOUNT_INACTIVE');

    const next = await issueRefreshToken({
      userId: user.id, familyId: record.family_id, ip, userAgent, conn,
    });

    await conn.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW(), revoked_reason = 'rotation', replaced_by_id = ?
        WHERE id = ?`,
      [next.tokenId, record.id]
    );

    return { user, refresh: next };
  });
}

export async function revokeRefreshToken(rawToken, reason = 'logout') {
  if (!rawToken) return;
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = ?
      WHERE token_hash = ? AND revoked_at IS NULL`,
    [reason, hashToken(rawToken)]
  );
}

export async function revokeAllUserSessions(userId, reason = 'logout_all') {
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = ?
      WHERE user_id = ? AND revoked_at IS NULL`,
    [reason, userId]
  );
}

/* ------------------------------------------------------------------ *
 *  Login attempt logging
 * ------------------------------------------------------------------ */

export async function recordLoginAttempt({
  userId = null, usernameTry, ip, userAgent, success, failReason = null,
}) {
  await pool.query(
    `INSERT INTO login_attempts
       (user_id, username_try, ip_address, user_agent, success, fail_reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, usernameTry, ip, userAgent, success ? 1 : 0, failReason]
  );
}

/* ------------------------------------------------------------------ *
 *  Lockout bookkeeping
 * ------------------------------------------------------------------ */

export async function registerFailedLogin(userId) {
  const [rows] = await pool.query(
    'SELECT failed_login_attempts FROM users WHERE id = ?',
    [userId]
  );
  const attempts = (rows[0]?.failed_login_attempts ?? 0) + 1;

  if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
    await pool.query(
      `UPDATE users
          SET failed_login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id = ?`,
      [attempts, env.LOCKOUT_MINUTES, userId]
    );
    return { locked: true, attempts };
  }

  await pool.query(
    'UPDATE users SET failed_login_attempts = ? WHERE id = ?',
    [attempts, userId]
  );
  return { locked: false, attempts };
}

export async function clearFailedLogins(userId) {
  await pool.query(
    `UPDATE users
        SET failed_login_attempts = 0, locked_until = NULL,
            last_login_at = NOW(), last_login_ip = ?
      WHERE id = ?`,
    [null, userId]
  );
}