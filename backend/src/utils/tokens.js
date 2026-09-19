import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      roleId: user.role_id,
      roleCode: user.role_code,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: 'hrmis',
      audience: 'hrmis-client',
    }
  );

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'hrmis',
    audience: 'hrmis-client',
  });

/** Cryptographically random opaque refresh token (never a JWT). */
export const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

export const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex');

export const newUuid = () => crypto.randomUUID();

/** Constant-time string comparison for token lookups. */
export const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};