import mysql from 'mysql2/promise';
import { env } from './env.js';

// Setup connection options dynamically
const connectionOptions = {
  uri: process.env.DB, // Reads the environment variable from your config
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  timezone: '+08:00',
  charset: 'utf8mb4_0900_ai_ci',
  dateStrings: ['DATE'],
  supportBigNumbers: true,
  bigNumberStrings: false,
};

// CRUCIAL FOR CLOUD HOSTING: Add SSL configuration if running on Render production
if (process.env.RENDER) {
  connectionOptions.ssl = {
    rejectUnauthorized: false
  };
}

export const pool = mysql.createPool(connectionOptions);

/** Run `fn(conn)` inside a transaction; auto commit/rollback + release. */
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

export async function assertDbConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}
