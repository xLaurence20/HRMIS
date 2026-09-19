import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the CA cert path: env override, or default to backend/certs/aiven-ca.pem
const caPath = process.env.DB_SSL_CA_PATH
  ?? path.resolve(__dirname, '../../certs/aiven-ca.pem');

const sslConfig = fs.existsSync(caPath)
  ? { ca: fs.readFileSync(caPath), rejectUnauthorized: true }
  : undefined;

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