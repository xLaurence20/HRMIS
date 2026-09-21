import { pool } from '../config/db.js';

/* ------------------------------------------------------------------ *
 *  Enums — keep these in sync with the audit_logs schema and the UI
 * ------------------------------------------------------------------ */
export const AuditAction = Object.freeze({
  CREATE:   'create',
  UPDATE:   'update',
  DELETE:   'delete',
  RESTORE:  'restore',

  LOGIN:    'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT:   'logout',
  PASSWORD_CHANGE: 'password_change',
  PERMISSION_CHANGE: 'permission_change',

  APPROVE:  'approve',
  REJECT:   'reject',
  CANCEL:   'cancel',
  SUBMIT:   'submit',
  RECOMMEND:'recommend',
  LOCK:     'lock',
  UNLOCK:   'unlock',

  CREDIT_COMMIT:   'credit_commit',
  CREDIT_REVERSE:  'credit_reverse',
  CREDIT_ADJUST:   'credit_adjust',
  ACCRUAL_RUN:     'accrual_run',

  EXPORT:   'export',
  IMPORT:   'import',
  PRINT:    'print',
});

export const AuditSeverity = Object.freeze({
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
});

/* ------------------------------------------------------------------ *
 *  recordAudit — the single entry point for audit writes.
 *
 *  Fire-and-forget safe: never throws to the caller. Log errors
 *  to console but let the business operation complete.
 *
 *  Fields:
 *    actorUserId   — req.user.id (nullable for system events)
 *    actorUsername — snapshot; pass req.user.username
 *    actorRoleCode — snapshot; pass req.user.roleCode
 *    ip            — req.ip
 *    userAgent     — req.headers['user-agent']
 *    httpMethod    — req.method
 *    httpPath      — req.originalUrl
 *    httpStatus    — res.statusCode (call after the handler responds)
 *    action        — one of AuditAction.*
 *    entityType    — 'employees' | 'users' | 'leave_applications' | ...
 *    entityId      — numeric id of the affected entity
 *    entityLabel   — human-readable snapshot, e.g. "EMP-0001 — Dela Cruz, Juan"
 *    changes       — { field: { from, to } } or { field: value }
 *    metadata      — free-form extra context
 *    severity      — info (default) | warning | critical
 *    requestId     — correlation id (from req.auditContext.requestId)
 * ------------------------------------------------------------------ */
export async function recordAudit({
  actorUserId = null,
  actorUsername = null,
  actorRoleCode = null,
  ip = null,
  userAgent = null,
  httpMethod = null,
  httpPath = null,
  httpStatus = null,
  action,
  entityType = null,
  entityId = null,
  entityLabel = null,
  changes = null,
  metadata = null,
  severity = AuditSeverity.INFO,
  requestId = null,
}) {
  if (!action) {
    console.warn('[audit] recordAudit called without action — skipping');
    return null;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_username, actor_role_code,
          ip_address, user_agent,
          http_method, http_path, http_status,
          action, entity_type, entity_id, entity_label,
          changes, metadata, severity, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorUserId,
        actorUsername,
        actorRoleCode,
        ip ? String(ip).slice(0, 45) : null,
        userAgent ? String(userAgent).slice(0, 255) : null,
        httpMethod ? String(httpMethod).slice(0, 10) : null,
        httpPath ? String(httpPath).slice(0, 255) : null,
        httpStatus,
        String(action).slice(0, 50),
        entityType ? String(entityType).slice(0, 60) : null,
        entityId,
        entityLabel ? String(entityLabel).slice(0, 255) : null,
        changes ? JSON.stringify(changes) : null,
        metadata ? JSON.stringify(metadata) : null,
        severity,
        requestId,
      ]
    );
    return result.insertId;
  } catch (err) {
    // Audit failures must never break the business flow.
    console.error('[audit] failed to write log:', err.message);
    return null;
  }
}

/* ================================================================== *
 *  Convenience wrappers — pull actor/http context from req
 * ================================================================== */

/** Attach req-derived context to any recordAudit call. */
function withReqContext(req, payload) {
  if (!req) return payload;
  const ctx = req.auditContext ?? {};
  return {
    actorUserId:   req.user?.id ?? null,
    actorUsername: req.user?.username ?? null,
    actorRoleCode: req.user?.roleCode ?? null,
    ip:            ctx.ip ?? req.ip ?? null,
    userAgent:     ctx.userAgent ?? req.headers?.['user-agent'] ?? null,
    httpMethod:    req.method ?? null,
    httpPath:      req.originalUrl ?? null,
    httpStatus:    req.res?.statusCode ?? null,
    requestId:     ctx.requestId ?? null,
    ...payload,
  };
}

export function auditCreate(req, { entityType, entityId, entityLabel, changes, metadata, severity }) {
  return recordAudit(withReqContext(req, {
    action: AuditAction.CREATE,
    entityType, entityId, entityLabel,
    changes: changes ?? null,
    metadata: metadata ?? null,
    severity: severity ?? AuditSeverity.INFO,
  }));
}

export function auditUpdate(req, { entityType, entityId, entityLabel, changes, metadata, severity }) {
  return recordAudit(withReqContext(req, {
    action: AuditAction.UPDATE,
    entityType, entityId, entityLabel,
    changes: changes ?? null,
    metadata: metadata ?? null,
    severity: severity ?? AuditSeverity.INFO,
  }));
}

export function auditDelete(req, { entityType, entityId, entityLabel, changes, metadata, severity }) {
  return recordAudit(withReqContext(req, {
    action: AuditAction.DELETE,
    entityType, entityId, entityLabel,
    changes: changes ?? null,
    metadata: metadata ?? null,
    severity: severity ?? AuditSeverity.WARNING,
  }));
}

/**
 * Generic action logger — for approve/reject/export/login/etc.
 * Caller supplies the action verb and any rich context.
 */
export function auditAction(req, {
  action, entityType, entityId, entityLabel,
  changes, metadata, severity,
}) {
  return recordAudit(withReqContext(req, {
    action,
    entityType, entityId, entityLabel,
    changes: changes ?? null,
    metadata: metadata ?? null,
    severity: severity ?? AuditSeverity.INFO,
  }));
}

/* ================================================================== *
 *  Entity label builders — consistent, readable snapshots
 * ================================================================== */
export const labelEmployee = (emp) => {
  if (!emp) return null;
  const num = emp.employee_number ?? emp.employeeNumber ?? '?';
  const name = emp.full_name ?? emp.fullName ?? `${emp.last_name}, ${emp.first_name}`;
  return `${num} — ${name}`;
};

export const labelUser = (u) => {
  if (!u) return null;
  return u.username ? `${u.username} (${u.email ?? 'no email'})` : null;
};

export const labelLeaveType = (lt) => {
  if (!lt) return null;
  return `${lt.code} — ${lt.name}`;
};

export const labelLeaveApplication = (la) => {
  if (!la) return null;
  return la.application_number ?? la.applicationNumber ?? null;
};

export const labelDepartment = (d) => {
  if (!d) return null;
  return `${d.code} — ${d.name}`;
};

export const labelPosition = (p) => {
  if (!p) return null;
  return `${p.code} — ${p.title}`;
};