import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { parsePagination } from '../utils/validate.js';
import { toCsv, sendCsvDownload, timestampedFilename } from '../utils/csvExport.js';
import { getReportHandler } from '../services/reportHandlerRegistry.js';
import { auditAction, AuditAction } from '../services/auditService.js';
import { getPermissionsForRole } from '../services/permissionService.js';

/* ================================================================== *
 *  Helpers
 * ================================================================== */

const parseJsonIfString = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const mapDefinition = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  module: r.module,
  reportType: r.report_type,
  handlerKey: r.handler_key,
  defaultFilters: parseJsonIfString(r.default_filters),
  allowedExportFormats: parseJsonIfString(r.allowed_export_formats) ?? ['csv'],
  requiredPermission: r.required_permission,
  isSystem: Boolean(r.is_system),
  isActive: Boolean(r.is_active),
  sortOrder: r.sort_order,
  icon: r.icon,
});

/**
 * Filter report definitions by the requesting user's permissions.
 * Admin bypasses (has all perms).
 */
async function filterDefinitionsByPermission(roleId, definitions) {
  const perms = await getPermissionsForRole(roleId);
  return definitions.filter((d) => perms.has(d.required_permission));
}

/* ================================================================== *
 *  GET /api/reports/definitions
 *  Returns only the reports this user can run.
 * ================================================================== */
export const listReportDefinitions = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';
  const where = ['1 = 1'];
  const params = [];

  if (activeOnly) where.push('is_active = 1');
  if (req.query.module) {
    where.push('module = ?');
    params.push(req.query.module);
  }

  const [rows] = await pool.query(
    `SELECT * FROM report_definitions
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, name ASC`,
    params
  );

  const allowed = await filterDefinitionsByPermission(req.user.roleId, rows);

  // Group by module for the UI
  const grouped = {};
  for (const d of allowed) {
    (grouped[d.module] ??= []).push(mapDefinition(d));
  }

  return ok(res, {
    definitions: allowed.map(mapDefinition),
    grouped,
    total: allowed.length,
  });
});

/* ================================================================== *
 *  GET /api/reports/definitions/:id
 * ================================================================== */
export const getReportDefinition = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    'SELECT * FROM report_definitions WHERE id = ?',
    [id]
  );
  if (!rows[0]) throw new AppError('Report definition not found.', 404, 'NOT_FOUND');

  const def = mapDefinition(rows[0]);
  const perms = await getPermissionsForRole(req.user.roleId);
  if (!perms.has(def.requiredPermission)) {
    throw new AppError('You do not have permission to run this report.',
      403, 'FORBIDDEN');
  }

  return ok(res, { definition: def });
});

/* ================================================================== *
 *  Internal: run a report by definition id, record the run.
 *  Returns { run, result } where result is the handler output.
 * ================================================================== */
async function executeReport({
  definitionId, filters, exportFormat = 'json', req,
}) {
  const startedAt = Date.now();

  // 1. Load + authorize
  const [defRows] = await pool.query(
    'SELECT * FROM report_definitions WHERE id = ? AND is_active = 1',
    [definitionId]
  );
  if (!defRows[0]) throw new AppError('Report definition not found.', 404, 'NOT_FOUND');
  const def = mapDefinition(defRows[0]);

  const perms = await getPermissionsForRole(req.user.roleId);
  if (!perms.has(def.requiredPermission)) {
    throw new AppError('You do not have permission to run this report.',
      403, 'FORBIDDEN');
  }

  // 2. Merge default filters with caller-provided
  const merged = { ...(def.defaultFilters ?? {}), ...(filters ?? {}) };

  // 3. Create run record (pending)
  const [ins] = await pool.query(
    `INSERT INTO report_runs
       (report_id, requested_by, filters_used, export_format, status, ip_address)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [def.id, req.user.id, JSON.stringify(merged), exportFormat, req.ip ?? null]
  );
  const runId = ins.insertId;

  // 4. Execute handler
  try {
    const handler = getReportHandler(def.handlerKey);
    const result = await handler(merged, { req, definition: def });

    const rowCount = result.document
      ? (result.document.records?.length ?? 0)
      : (result.rows?.length ?? 0);

    const durationMs = Date.now() - startedAt;

    await pool.query(
      `UPDATE report_runs
          SET status = 'completed',
              row_count = ?,
              completed_at = NOW(3),
              duration_ms = ?
        WHERE id = ?`,
      [rowCount, durationMs, runId]
    );

    return { def, run: { id: runId, rowCount, durationMs }, result };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE report_runs
          SET status = 'failed',
              error_message = ?,
              completed_at = NOW(3),
              duration_ms = ?
        WHERE id = ?`,
      [String(err.message ?? err).slice(0, 500), durationMs, runId]
    );
    throw err;
  }
}

/* ================================================================== *
 *  POST /api/reports/:id/run
 *  Body: { filters?: object }
 *  Returns JSON data (list/aggregate reports).
 * ================================================================== */
export const runReport = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const filters = req.body?.filters ?? {};
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new AppError('filters must be an object.', 400, 'VALIDATION_ERROR');
  }

  const { def, run, result } = await executeReport({
    definitionId: id, filters, exportFormat: 'json', req,
  });

  // Audit the run (fallback logger will also skip because _auditRecorded is set)
  await auditAction(req, {
    action: AuditAction.EXPORT,
    entityType: 'report_definitions',
    entityId: def.id,
    entityLabel: `${def.code} — ${def.name}`,
    metadata: {
      reportRunId: run.id,
      rowCount: run.rowCount,
      durationMs: run.durationMs,
      filters,
    },
  });
  req._auditRecorded = true;

  return ok(res, {
    definition: def,
    run: { id: run.id, rowCount: run.rowCount, durationMs: run.durationMs },
    columns: result.columns ?? null,
    rows: result.rows ?? null,
    document: result.document ?? null,
    meta: result.meta ?? null,
  });
});

/* ================================================================== *
 *  POST /api/reports/:id/export/csv
 *  Runs the report and streams the result as CSV.
 *  Body: { filters?: object, filename?: string }
 * ================================================================== */
export const exportReportCsv = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const filters = req.body?.filters ?? {};
  const filename = req.body?.filename ?? null;

  const { def, run, result } = await executeReport({
    definitionId: id, filters, exportFormat: 'csv', req,
  });

  if (!result.columns || !result.rows) {
    // Document-type reports can't export as CSV in this version
    throw new AppError(
      `${def.name} is a document-type report and cannot be exported as CSV.`,
      400, 'NOT_CSV_EXPORTABLE'
    );
  }

  const csv = toCsv(result.rows, result.columns);

  await auditAction(req, {
    action: AuditAction.EXPORT,
    entityType: 'report_definitions',
    entityId: def.id,
    entityLabel: `${def.code} — ${def.name}`,
    metadata: {
      reportRunId: run.id,
      rowCount: run.rowCount,
      durationMs: run.durationMs,
      exportFormat: 'csv',
      filters,
    },
  });
  req._auditRecorded = true;

  const base = filename
    ? String(filename).replace(/[^\w.\-]+/g, '_').replace(/\.csv$/i, '')
    : def.code.toLowerCase().replace(/_/g, '-');

  return sendCsvDownload(res, timestampedFilename(base, 'csv'), csv);
});

/* ================================================================== *
 *  GET /api/reports/runs
 *  Query: ?reportId=  ?requestedBy=  ?status=  ?page=  ?limit=
 * ================================================================== */
export const listReportRuns = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });

  const where = ['1 = 1'];
  const params = [];

  if (req.query.reportId) {
    where.push('rr.report_id = ?');
    params.push(Number(req.query.reportId));
  }
  if (req.query.requestedBy) {
    where.push('rr.requested_by = ?');
    params.push(Number(req.query.requestedBy));
  }
  if (req.query.status) {
    where.push('rr.status = ?');
    params.push(req.query.status);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM report_runs rr ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       rr.*,
       rd.code AS report_code, rd.name AS report_name, rd.module,
       u.username AS requested_by_username
     FROM report_runs rr
     LEFT JOIN report_definitions rd ON rd.id = rr.report_id
     LEFT JOIN users u ON u.id = rr.requested_by
     ${whereSql}
     ORDER BY rr.requested_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    runs: rows.map((r) => ({
      id: r.id,
      reportId: r.report_id,
      reportCode: r.report_code,
      reportName: r.report_name,
      module: r.module,
      requestedBy: r.requested_by,
      requestedByUsername: r.requested_by_username,
      filtersUsed: parseJsonIfString(r.filters_used),
      exportFormat: r.export_format,
      rowCount: r.row_count != null ? Number(r.row_count) : null,
      status: r.status,
      errorMessage: r.error_message,
      requestedAt: r.requested_at,
      completedAt: r.completed_at,
      durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
      ipAddress: r.ip_address,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/reports/runs/:id
 * ================================================================== */
export const getReportRun = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    `SELECT rr.*, rd.code AS report_code, rd.name AS report_name
       FROM report_runs rr
       LEFT JOIN report_definitions rd ON rd.id = rr.report_id
      WHERE rr.id = ?`,
    [id]
  );
  if (!rows[0]) throw new AppError('Report run not found.', 404, 'NOT_FOUND');

  return ok(res, { run: rows[0] });
});