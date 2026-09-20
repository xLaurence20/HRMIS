import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the CA cert path.
 *  - In production (Render), it comes from a Render Secret File and
 *    DB_SSL_CA_PATH env var points at it.
 *  - In dev, if `backend/certs/aiven-ca.pem` exists we use it; otherwise
 *    we skip SSL (local MariaDB doesn't need it).
 */
const caPath =
  process.env.DB_SSL_CA_PATH ??
  path.resolve(__dirname, '../../certs/aiven-ca.pem');

/**
 * Enable SSL only when:
 *   - NODE_ENV=production (Render + Aiven), OR
 *   - DB_SSL=true is set explicitly in .env
 *
 * Local MariaDB installs (XAMPP, native) typically don't have SSL enabled,
 * so we default to plain connections in dev.
 */
const sslEnabled = env.IS_PROD || String(process.env.DB_SSL).toLowerCase() === 'true';

let sslConfig;
if (sslEnabled) {
  if (fs.existsSync(caPath)) {
    sslConfig = {
      ca: fs.readFileSync(caPath),
      rejectUnauthorized: true,
    };
  } else {
    // SSL requested but no CA on disk. Fall back to SSL with verification off
    // (still encrypted, but not CA-verified) so the connection can proceed.
    console.warn(`[db] SSL requested but CA not found at ${caPath}. Using unverified TLS.`);
    sslConfig = { rejectUnauthorized: false };
  }
}

export const pool = mysql.createPool({
  ...env.DB,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  timezone: '+08:00',
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATE'],
  supportBigNumbers: true,
  bigNumberStrings: false,
  ...(sslConfig ? { ssl: sslConfig } : {}),
});

/**
 * Run `fn(conn)` inside a transaction; auto commit/rollback + release.
 *
 * Usage:
 *   const result = await withTransaction(async (conn) => {
 *     const [rows] = await conn.query('SELECT ...');
 *     return rows;
 *   });
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* rollback best-effort */ }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Sanity check used at boot. Throws if the DB is unreachable.
 */
export async function assertDbConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}