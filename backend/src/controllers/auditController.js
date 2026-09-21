import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { parsePagination } from '../utils/validate.js';
import { toCsv, sendCsvDownload, timestampedFilename } from '../utils/csvExport.js';
import { auditAction, AuditAction } from '../services/auditService.js';

const SEVERITIES = ['info', 'warning', 'critical'];

/* ------------------------------------------------------------------ *
 *  Mapper
 * ------------------------------------------------------------------ */
const parseJsonIfString = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const mapAuditRow = (r) => ({
  id: r.id,
  eventTime: r.event_time,
  actor: r.actor_user_id
    ? {
        userId: r.actor_user_id,
        username: r.actor_username,
        roleCode: r.actor_role_code,
        status: r.actor_user_status ?? null,
      }
    : null,
  ip: r.ip_address,
  userAgent: r.user_agent,
  http: r.http_method
    ? { method: r.http_method, path: r.http_path, status: r.http_status }
    : null,
  action: r.action,
  entity: r.entity_type
    ? { type: r.entity_type, id: r.entity_id, label: r.entity_label }
    : null,
  changes: parseJsonIfString(r.changes),
  metadata: parseJsonIfString(r.metadata),
  severity: r.severity,
  requestId: r.request_id,
});

/* ------------------------------------------------------------------ *
 *  Filter builder shared by list + export
 * ------------------------------------------------------------------ */
function buildAuditWhere(query) {
  const where = ['1 = 1'];
  const params = [];

  if (query.actorUserId) {
    where.push('a.actor_user_id = ?');
    params.push(Number(query.actorUserId));
  }
  if (query.action) {
    where.push('a.action = ?');
    params.push(query.action);
  }
  if (query.entityType) {
    where.push('a.entity_type = ?');
    params.push(query.entityType);
  }
  if (query.entityId) {
    where.push('a.entity_id = ?');
    params.push(Number(query.entityId));
  }
  if (query.severity) {
    if (!SEVERITIES.includes(query.severity)) {
      throw new AppError('Invalid severity.', 400, 'VALIDATION_ERROR');
    }
    where.push('a.severity = ?');
    params.push(query.severity);
  }
  if (query.fromDate) {
    where.push('a.event_time >= ?');
    params.push(`${query.fromDate} 00:00:00`);
  }
  if (query.toDate) {
    where.push('a.event_time <= ?');
    params.push(`${query.toDate} 23:59:59`);
  }
  if (query.search) {
    const q = `%${query.search.trim()}%`;
    where.push(
      `(a.actor_username LIKE ? OR a.entity_label LIKE ?
        OR a.http_path LIKE ? OR a.action LIKE ?)`
    );
    params.push(q, q, q, q);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

/* ================================================================== *
 *  GET /api/audit-logs
 * ================================================================== */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  const { whereSql, params } = buildAuditWhere(req.query);

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT * FROM v_audit_logs_full a
     ${whereSql}
     ORDER BY a.event_time DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    logs: rows.map(mapAuditRow),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/audit-logs/:id
 * ================================================================== */
export const getAuditLog = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT * FROM v_audit_logs_full WHERE id = ?',
    [id]
  );
  if (!rows[0]) throw new AppError('Audit entry not found.', 404, 'NOT_FOUND');

  return ok(res, { log: mapAuditRow(rows[0]) });
});

/* ================================================================== *
 *  GET /api/audit-logs/stats
 *  Optional: ?days=30  (default 30, max 365)
 * ================================================================== */
export const getAuditStats = asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [totals] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN severity = 'info'     THEN 1 ELSE 0 END) AS info,
       SUM(CASE WHEN severity = 'warning'  THEN 1 ELSE 0 END) AS warning,
       SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
       COUNT(DISTINCT actor_user_id) AS distinct_actors
     FROM audit_logs
     WHERE event_time >= ?`,
    [since]
  );

  const [byAction] = await pool.query(
    `SELECT action, COUNT(*) AS count
       FROM audit_logs
      WHERE event_time >= ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10`,
    [since]
  );

  const [byEntity] = await pool.query(
    `SELECT entity_type, COUNT(*) AS count
       FROM audit_logs
      WHERE event_time >= ? AND entity_type IS NOT NULL
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 10`,
    [since]
  );

  const [topActors] = await pool.query(
    `SELECT actor_user_id, actor_username, actor_role_code, COUNT(*) AS count
       FROM audit_logs
      WHERE event_time >= ? AND actor_user_id IS NOT NULL
      GROUP BY actor_user_id, actor_username, actor_role_code
      ORDER BY count DESC
      LIMIT 10`,
    [since]
  );

  const [dailyTrend] = await pool.query(
    `SELECT DATE(event_time) AS day, COUNT(*) AS count
       FROM audit_logs
      WHERE event_time >= ?
      GROUP BY DATE(event_time)
      ORDER BY day ASC`,
    [since]
  );

  return ok(res, {
    periodDays: days,
    since: since.toISOString(),
    totals: {
      total: Number(totals[0].total),
      info: Number(totals[0].info),
      warning: Number(totals[0].warning),
      critical: Number(totals[0].critical),
      distinctActors: Number(totals[0].distinct_actors),
    },
    byAction: byAction.map((r) => ({ action: r.action, count: Number(r.count) })),
    byEntity: byEntity.map((r) => ({ entityType: r.entity_type, count: Number(r.count) })),
    topActors: topActors.map((r) => ({
      userId: r.actor_user_id,
      username: r.actor_username,
      roleCode: r.actor_role_code,
      count: Number(r.count),
    })),
    dailyTrend: dailyTrend.map((r) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      count: Number(r.count),
    })),
  });
});

/* ================================================================== *
 *  GET /api/audit-logs/export
 *  Streams CSV with the same filters as the list endpoint.
 * ================================================================== */
export const exportAuditLogs = asyncHandler(async (req, res) => {
  const { whereSql, params } = buildAuditWhere(req.query);

  // Safety cap — CSV exports beyond 50k rows get truncated.
  const HARD_CAP = 50_000;

  const [rows] = await pool.query(
    `SELECT * FROM v_audit_logs_full a
     ${whereSql}
     ORDER BY a.event_time DESC, a.id DESC
     LIMIT ?`,
    [...params, HARD_CAP]
  );

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'event_time', header: 'Time' },
    { key: 'actor_username', header: 'Actor' },
    { key: 'actor_role_code', header: 'Role' },
    { key: 'action', header: 'Action' },
    { key: 'entity_type', header: 'Entity Type' },
    { key: 'entity_id', header: 'Entity ID' },
    { key: 'entity_label', header: 'Entity Label' },
    { key: 'severity', header: 'Severity' },
    { key: 'http_method', header: 'HTTP Method' },
    { key: 'http_path', header: 'Path' },
    { key: 'http_status', header: 'Status' },
    { key: 'ip_address', header: 'IP Address' },
    {
      key: 'changes', header: 'Changes',
      format: (v) => v ? JSON.stringify(v) : '',
    },
    {
      key: 'metadata', header: 'Metadata',
      format: (v) => v ? JSON.stringify(v) : '',
    },
  ];

  const csv = toCsv(rows, columns);

  // Audit the export action itself
  await auditAction(req, {
    action: AuditAction.EXPORT,
    entityType: 'audit_logs',
    metadata: {
      rowCount: rows.length,
      filters: req.query,
      cap: HARD_CAP,
      truncated: rows.length === HARD_CAP,
    },
  });

  return sendCsvDownload(res, timestampedFilename('audit-logs', 'csv'), csv);
});

/* ================================================================== *
 *  GET /api/audit-logs/actions   — distinct action values for filters
 * ================================================================== */
export const listDistinctActions = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT action FROM audit_logs ORDER BY action ASC`
  );
  return ok(res, { actions: rows.map((r) => r.action) });
});

export const listDistinctEntityTypes = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT entity_type FROM audit_logs
      WHERE entity_type IS NOT NULL
      ORDER BY entity_type ASC`
  );
  return ok(res, { entityTypes: rows.map((r) => r.entity_type) });
});