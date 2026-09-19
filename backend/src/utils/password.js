import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * A valid-format dummy hash used to equalise response time when a username
 * does not exist (prevents user-enumeration via timing).
 */
export const DUMMY_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Vd4sVQbqF8h9jK1lM2nO3pQ4rS5tU6';

/**
 * Government-grade password policy.
 * >= 12 chars, upper, lower, digit, and a symbol.
 */
export function assertPasswordPolicy(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 12)
    errors.push('Password must be at least 12 characters long.');
  if (!/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Must contain a lowercase letter.');
  if (!/\d/.test(password))    errors.push('Must contain a number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Must contain a symbol.');
  return errors;
}