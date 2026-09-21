import { useEffect, useState, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Loader2, RefreshCw, Download, ChevronRight, ChevronDown,
  History, AlertTriangle, Info, ShieldAlert, User, Eye,
} from 'lucide-react';
import { api, extractApiError, getAccessToken } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/ui/Pagination';
import DataTableShell from '../components/ui/DataTableShell';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';

const SEVERITY_BADGE = {
  info:     'bg-slate-100 text-slate-700 ring-slate-200',
  warning:  'bg-amber-50 text-amber-700 ring-amber-200',
  critical: 'bg-red-50 text-red-700 ring-red-200',
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

const ACTION_BADGE_COLORS = {
  create:  'bg-emerald-50 text-emerald-700',
  update:  'bg-brand-50 text-brand-700',
  delete:  'bg-red-50 text-red-700',
  login:   'bg-slate-100 text-slate-700',
  login_failed: 'bg-red-50 text-red-700',
  logout:  'bg-slate-100 text-slate-600',
  approve: 'bg-emerald-50 text-emerald-800',
  reject:  'bg-red-50 text-red-800',
  export:  'bg-violet-50 text-violet-700',
  import:  'bg-violet-50 text-violet-700',
  print:   'bg-brand-50 text-brand-700',
  credit_commit:  'bg-emerald-50 text-emerald-800',
  credit_reverse: 'bg-amber-50 text-amber-800',
  credit_adjust:  'bg-brand-50 text-brand-800',
  accrual_run:    'bg-brand-50 text-brand-800',
  permission_change: 'bg-red-50 text-red-800',
  http_error: 'bg-red-50 text-red-700',
};

const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const truncate = (v, n = 60) => {
  if (v === null || v === undefined) return '—';
  const s = String(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

export default function AuditTrail() {
  const { hasPermission } = useAuth();

  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [actions, setActions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);

  const [expandedId, setExpandedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  /* Debounce search */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* Load filter option lists once */
  useEffect(() => {
    (async () => {
      try {
        const [a, e] = await Promise.all([
          api.get('/audit-logs/actions'),
          api.get('/audit-logs/entity-types'),
        ]);
        setActions(a.data.data.actions ?? []);
        setEntityTypes(e.data.data.entityTypes ?? []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  /* Build query string from filters */
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', pagination.page);
    params.set('limit', pagination.limit);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (severity) params.set('severity', severity);
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    return params;
  }, [pagination.page, pagination.limit, debouncedSearch, severity, action, entityType, fromDate, toDate]);

  /* Load logs */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/audit-logs?${buildQuery().toString()}`);
      setLogs(data.data.logs);
      setPagination((p) => ({ ...p, total: data.data.pagination.total }));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  /* Reset to page 1 on filter change */
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [debouncedSearch, severity, action, entityType, fromDate, toDate]);

  function clearFilters() {
    setSearch('');
    setSeverity('');
    setAction('');
    setEntityType('');
    setFromDate('');
    setToDate('');
  }

  const activeFilterCount = [debouncedSearch, severity, action, entityType, fromDate, toDate]
    .filter(Boolean).length;

  async function openDetail(id) {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/audit-logs/${id}`);
      setDetail(data.data.log);
    } catch (err) {
      setDetail({ error: extractApiError(err).message });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      // Same filters, but the export endpoint returns a file
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (severity) params.set('severity', severity);
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);

      const baseURL = api.defaults.baseURL ?? '';
      const token = getAccessToken();
      const url = `${baseURL}/audit-logs/export?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const match = contentDisposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `audit-logs_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message ?? 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <History className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Audit Trail</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Immutable log of every mutating action in the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || pagination.total === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative flex-1 lg:min-w-[300px] lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, path, entity…"
              className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All entities</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataTableShell
          loading={loading}
          error={error}
          isEmpty={!loading && !error && logs.length === 0}
          emptyProps={{
            Icon: History,
            title: 'No audit entries',
            description: activeFilterCount
              ? 'Try adjusting your filters or the date range.'
              : 'Audit entries will appear here once users start interacting with the system.',
          }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  {['Time', 'Actor', 'Action', 'Entity', 'Severity', 'HTTP', 'IP'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const SeverityIcon = SEVERITY_ICON[log.severity] ?? Info;
                  const hasChanges = log.changes && typeof log.changes === 'object'
                    && Object.keys(log.changes).length > 0;

                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`cursor-pointer transition hover:bg-brand-50/40 ${
                          log.severity === 'critical' ? 'bg-red-50/30' : ''
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-2 py-3 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                          {fmtDateTime(log.eventTime)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {log.actor ? (
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                                {(log.actor.username ?? '?')[0].toUpperCase()}
                              </span>
                              <div>
                                <p className="text-xs font-medium text-slate-800">
                                  {log.actor.username}
                                </p>
                                {log.actor.roleCode && (
                                  <p className="text-[10px] text-slate-500">{log.actor.roleCode}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs italic text-slate-400">system</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            ACTION_BADGE_COLORS[log.action] ?? 'bg-slate-100 text-slate-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {log.entity ? (
                            <div>
                              <p className="font-mono text-[11px] text-slate-500">
                                {log.entity.type}
                                {log.entity.id != null && `#${log.entity.id}`}
                              </p>
                              <p className="text-xs text-slate-700">
                                {truncate(log.entity.label, 60)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            SEVERITY_BADGE[log.severity] ?? SEVERITY_BADGE.info
                          }`}>
                            <SeverityIcon className="h-3 w-3" />
                            {log.severity}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                          {log.http ? (
                            <>
                              <span className="font-medium">{log.http.method}</span>
                              {' '}
                              <span className="text-slate-400">{log.http.status}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-500">
                          {log.ip ?? '—'}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                              <div className="lg:col-span-2 space-y-4">
                                {hasChanges ? (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Changes
                                    </p>
                                    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                      <table className="min-w-full text-xs">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Field</th>
                                            <th className="px-3 py-1.5 text-left font-semibold text-slate-600">From</th>
                                            <th className="px-3 py-1.5 text-left font-semibold text-slate-600">To</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {Object.entries(log.changes).map(([key, val]) => {
                                            const isDiff = val && typeof val === 'object'
                                              && ('from' in val || 'to' in val);
                                            return (
                                              <tr key={key}>
                                                <td className="px-3 py-1.5 font-mono text-slate-700">{key}</td>
                                                {isDiff ? (
                                                  <>
                                                    <td className="px-3 py-1.5 text-red-700">
                                                      {val.from === null || val.from === undefined
                                                        ? <em className="text-slate-400">null</em>
                                                        : String(val.from)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-emerald-700">
                                                      {val.to === null || val.to === undefined
                                                        ? <em className="text-slate-400">null</em>
                                                        : String(val.to)}
                                                    </td>
                                                  </>
                                                ) : (
                                                  <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
                                                    {val === null || val === undefined
                                                      ? <em className="text-slate-400">null</em>
                                                      : String(val)}
                                                  </td>
                                                )}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs italic text-slate-500">
                                    No field-level changes captured.
                                  </p>
                                )}
                              </div>

                              <div className="space-y-3">
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Metadata
                                    </p>
                                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] text-slate-700">
{JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {log.http && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Request
                                    </p>
                                    <p className="mt-1 break-all font-mono text-[11px] text-slate-700">
                                      {log.http.method} {log.http.path}
                                    </p>
                                  </div>
                                )}

                                {log.userAgent && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      User agent
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-600">
                                      {truncate(log.userAgent, 120)}
                                    </p>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openDetail(log.id); }}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Open full details
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataTableShell>

        {!loading && !error && logs.length > 0 && (
          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
          />
        )}
      </div>

      {/* Full-detail modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Audit entry detail"
        size="xl"
      >
        {detailLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : detail?.error ? (
          <Alert variant="error">{detail.error}</Alert>
        ) : detail ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Time</dt>
                <dd className="font-mono text-slate-800">{fmtDateTime(detail.eventTime)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Actor</dt>
                <dd className="text-slate-800">
                  {detail.actor?.username ?? <em className="text-slate-400">system</em>}
                  {detail.actor?.roleCode && (
                    <span className="ml-1 text-xs text-slate-500">({detail.actor.roleCode})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Action</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    ACTION_BADGE_COLORS[detail.action] ?? 'bg-slate-100 text-slate-700'
                  }`}>
                    {detail.action}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Severity</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    SEVERITY_BADGE[detail.severity] ?? SEVERITY_BADGE.info
                  }`}>
                    {detail.severity}
                  </span>
                </dd>
              </div>
              {detail.entity && (
                <>
                  <div>
                    <dt className="text-xs text-slate-500">Entity type</dt>
                    <dd className="font-mono text-slate-800">{detail.entity.type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Entity ID</dt>
                    <dd className="font-mono text-slate-800">{detail.entity.id ?? '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-500">Entity label</dt>
                    <dd className="text-slate-800">{detail.entity.label ?? '—'}</dd>
                  </div>
                </>
              )}
              {detail.http && (
                <>
                  <div>
                    <dt className="text-xs text-slate-500">HTTP</dt>
                    <dd className="font-mono text-slate-800">
                      {detail.http.method} {detail.http.path} → {detail.http.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">IP</dt>
                    <dd className="font-mono text-slate-800">{detail.ip ?? '—'}</dd>
                  </div>
                </>
              )}
              {detail.requestId && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Request ID</dt>
                  <dd className="break-all font-mono text-xs text-slate-700">
                    {detail.requestId}
                  </dd>
                </div>
              )}
              {detail.userAgent && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">User agent</dt>
                  <dd className="text-xs text-slate-700">{detail.userAgent}</dd>
                </div>
              )}
            </dl>

            {detail.changes && Object.keys(detail.changes).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Changes
                </p>
                <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-800">
{JSON.stringify(detail.changes, null, 2)}
                </pre>
              </div>
            )}

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Metadata
                </p>
                <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-800">
{JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}