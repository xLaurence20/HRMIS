import dotenv from 'dotenv';
dotenv.config();

const required = [
  'DB_HOST', 'DB_USER', 'DB_NAME',
  'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
];

const missing = required.filter((k) => process.env[k] === undefined);
if (missing.length) {
  // Fail fast — never boot with an incomplete security configuration.
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  IS_PROD: (process.env.NODE_ENV ?? 'development') === 'production',
  PORT: num(process.env.PORT, 5000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  DB: {
    host: process.env.DB_HOST,
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    connectionLimit: num(process.env.DB_POOL_SIZE, 10),
  },

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL ?? '15m',
  REFRESH_TOKEN_TTL_DAYS: num(process.env.REFRESH_TOKEN_TTL_DAYS, 7),

  BCRYPT_ROUNDS: num(process.env.BCRYPT_ROUNDS, 12),
  MAX_LOGIN_ATTEMPTS: num(process.env.MAX_LOGIN_ATTEMPTS, 5),
  LOCKOUT_MINUTES: num(process.env.LOCKOUT_MINUTES, 15),

  REFRESH_COOKIE_NAME: 'hrmis_rt',
  REFRESH_COOKIE_PATH: '/api/auth',
};

export const refreshTtlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;