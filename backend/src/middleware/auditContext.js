import crypto from 'node:crypto';

/**
 * Attach audit context to every incoming request.
 * Sets req.auditContext = { requestId, ip, userAgent, startedAt }
 * and installs a res.on('finish') fallback that logs any mutating
 * request the controller did not already audit explicitly.
 */
export function attachAuditContext(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  req.auditContext = {
    requestId,
    ip: (req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0')
      .replace('::ffff:', '')
      .slice(0, 45),
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
    startedAt,
  };

  // Expose the request ID in a response header for cross-referencing
  res.setHeader('X-Request-Id', requestId);

  // Fallback logger: runs after the response is sent
  res.on('finish', () => {
    const method = req.method?.toUpperCase();
    const isMutating = method === 'POST' || method === 'PUT'
      || method === 'PATCH' || method === 'DELETE';

    if (!isMutating) return;
    if (req._auditRecorded) return;              // controller already logged

    // Lazy import to avoid a circular dependency at module load
    import('../services/auditService.js')
      .then(({ recordAudit, AuditAction, AuditSeverity }) => {
        const status = res.statusCode;
        const success = status >= 200 && status < 400;

        // Determine action verb from method
        const actionMap = {
          POST:   AuditAction.CREATE,
          PUT:    AuditAction.UPDATE,
          PATCH:  AuditAction.UPDATE,
          DELETE: AuditAction.DELETE,
        };

        // Severity: mark 4xx/5xx on mutations as warning
        const severity = success
          ? AuditSeverity.INFO
          : AuditSeverity.WARNING;

        return recordAudit({
          actorUserId:   req.user?.id ?? null,
          actorUsername: req.user?.username ?? null,
          actorRoleCode: req.user?.roleCode ?? null,
          ip:            req.auditContext.ip,
          userAgent:     req.auditContext.userAgent,
          httpMethod:    method,
          httpPath:      req.originalUrl,
          httpStatus:    status,
          action:        success ? actionMap[method] : 'http_error',
          entityType:    null,                    // unknown at this layer
          entityId:      null,
          entityLabel:   null,
          changes:       null,
          metadata: {
            fallback:    true,
            statusCode:  status,
            contentType: req.headers['content-type'] ?? null,
            bodyKeys:    req.body && typeof req.body === 'object'
              ? Object.keys(req.body).slice(0, 20)
              : [],
          },
          severity,
          requestId:     req.auditContext.requestId,
        });
      })
      .catch((err) => {
        console.error('[audit] fallback logger failed:', err.message);
      });
  });

  next();
}

/**
 * Call from any controller that already wrote a rich audit entry.
 * Tells the fallback HTTP logger to skip this request.
 */
export function markAuditRecorded(req) {
  if (req) req._auditRecorded = true;
}