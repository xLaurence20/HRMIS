import { pool } from '../config/db.js';

/**
 * In-process permission cache.
 * Key: roleId -> { perms: Set<string>, expiresAt: number }
 *
 * IMPORTANT: with more than one Node instance behind a load balancer this
 * cache is per-process. The 60s TTL bounds staleness; for immediate
 * cross-instance invalidation, swap this for Redis pub/sub in Phase 5.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map();

export async function getPermissionsForRole(roleId, conn = pool) {
  const hit = cache.get(roleId);
  if (hit && hit.expiresAt > Date.now()) return hit.perms;

  const [rows] = await conn.query(
    `SELECT p.permission_name
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?`,
    [roleId]
  );

  const perms = new Set(rows.map((r) => r.permission_name));
  cache.set(roleId, { perms, expiresAt: Date.now() + CACHE_TTL_MS });
  return perms;
}

export function invalidatePermissionCache(roleId) {
  if (roleId === undefined) cache.clear();
  else cache.delete(roleId);
}

/** Flatten a role's permissions into a sorted array for API responses. */
export async function getPermissionList(roleId, conn = pool) {
  const set = await getPermissionsForRole(roleId, conn);
  return [...set].sort();
}