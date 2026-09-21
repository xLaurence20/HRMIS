import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Loader2, RefreshCw, Play, Download, Search,
  ChevronRight, X, Filter, BarChart3, Users, Calendar,
  Wallet, Clock, Award, TrendingDown, Building2, History,
  UserCheck, Banknote, AlertTriangle, FileCheck,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

/* Lucide icon lookup by the definition's `icon` field */
const ICONS = {
  Users, FileText, Award, Building2, PieChart: BarChart3, TrendingDown,
  Activity: TrendingDown, Wallet, CalendarDays: Calendar, Banknote,
  Clock, History, AlertTriangle, UserCheck, CheckCircle2: FileCheck,
};

/* Reports whose UI lives on a dedicated page rather than in a modal */
const DEDICATED_ROUTES = {
  COE: '/reports/coe',
  SERVICE_RECORDS: '/reports/service-record',
};

const MODULE_LABELS = {
  employees: 'Employees',
  documents: 'Documents',
  organization: 'Organization',
  attendance: 'Attendance',
  credits: 'Leave Credits',
  leaves: 'Leave',
  audit: 'Audit',
};

export default function ReportLibrary() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  // Execution state
  const [activeDef, setActiveDef] = useState(null);
  const [filters, setFilters] = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState(null);
  const [exporting, setExporting] = useState(false);

  /* ---- Load definitions ---- */
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/reports/definitions');
      setDefinitions(data.data.definitions ?? []);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---- Group + filter ---- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return definitions;
    return definitions.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.module.toLowerCase().includes(q)
    );
  }, [definitions, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of filtered) {
      if (!map.has(d.module)) map.set(d.module, []);
      map.get(d.module).push(d);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  /* ---- Open report ---- */
  function openReport(def) {
    if (DEDICATED_ROUTES[def.code]) {
      navigate(DEDICATED_ROUTES[def.code]);
      return;
    }
    setActiveDef(def);
    setFilters({ ...(def.defaultFilters ?? {}) });
    setResult(null);
    setRunError(null);
  }

  function closeReport() {
    if (running) return;
    setActiveDef(null);
    setResult(null);
    setRunError(null);
  }

  /* ---- Run report ---- */
  async function runReport() {
    if (!activeDef) return;
    setRunning(true); setRunError(null); setResult(null);
    try {
      const { data } = await api.post(`/reports/${activeDef.id}/run`, { filters });
      setResult(data.data);
    } catch (err) {
      const e = extractApiError(err);
      setRunError(e.details?.fields
        ? `${e.message} (${e.details.fields.map(f => f.field).join(', ')})`
        : e.message);
    } finally { setRunning(false); }
  }

  /* ---- Export CSV ---- */
    /* ---- Export CSV ---- */
  async function exportCsv() {
    if (!activeDef) return;
    setExporting(true); setRunError(null);
    try {
      // Use axios (not fetch) so the request interceptor attaches the JWT.
      // responseType 'blob' keeps the CSV payload intact.
      const response = await api.post(
        `/reports/${activeDef.id}/export/csv`,
        { filters },
        { responseType: 'blob' }
      );

      // Pull the filename from the Content-Disposition header
      const cd = response.headers['content-disposition'] ?? '';
      const name = cd.match(/filename="([^"]+)"/)?.[1]
        ?? `${activeDef.code.toLowerCase()}.csv`;

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv;charset=utf-8' });

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // With responseType: 'blob', error bodies also come back as Blobs.
      // Unwrap them so the user sees the real message.
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text);
          setRunError(parsed?.error?.message ?? `Export failed: HTTP ${err?.response?.status}`);
        } catch {
          setRunError(`Export failed: HTTP ${err?.response?.status ?? 'unknown'}`);
        }
      } else {
        setRunError(extractApiError(err).message);
      }
    } finally { setExporting(false); }
  }

  /* ---- Filter form rendering ---- */
  function renderFilterField(key, value) {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase());

    if (typeof value === 'boolean') {
      return (
        <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!filters[key]}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {label}
        </label>
      );
    }

    if (key === 'year') {
      const now = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
      return (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700">{label}</label>
          <select value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">— select —</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      );
    }

    if (key === 'month') {
      const names = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
      return (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700">{label}</label>
          <select value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">— select —</option>
            {names.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </div>
      );
    }

    if (key.endsWith('Date')) {
      return (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700">{label}</label>
          <input type="date" value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
      );
    }

    if (key.endsWith('Id') || ['days', 'months'].includes(key)) {
      return (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700">{label}</label>
          <input type="number" value={filters[key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
      );
    }

    return (
      <div key={key}>
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <input type="text" value={filters[key] ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>
    );
  }

  /* ---- Render ---- */
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <FileText className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Report Library</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Run standard HRMIS reports and export them as CSV. Every run is audited.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {/* Search */}
      <div className="mt-6 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
      </div>

      {/* Report cards grouped by module */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="mt-8">
          <EmptyState Icon={FileText} title="No reports found"
            description={query ? 'Try a different search term.' : 'You do not have access to any reports.'} />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map(([module, reports]) => (
            <section key={module}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                {MODULE_LABELS[module] ?? module}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reports.map((d) => {
                  const Icon = ICONS[d.icon] ?? FileText;
                  const isDedicated = Boolean(DEDICATED_ROUTES[d.code]);
                  return (
                    <button key={d.id} type="button" onClick={() => openReport(d)}
                      className="group flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                        {d.description && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                            {d.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-brand-600">
                        {isDedicated ? 'Open generator' : 'Run report'}
                        <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Run modal */}
      <Modal
        open={Boolean(activeDef)}
        onClose={running ? () => {} : closeReport}
        title={activeDef?.name ?? ''}
        description={activeDef?.description ?? ''}
        size="2xl"
        closeOnBackdrop={!running}
        footer={
          <>
            <button type="button" onClick={closeReport} disabled={running}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Close
            </button>
            {result && (
              <button type="button" onClick={exportCsv}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export CSV
              </button>
            )}
            <button type="button" onClick={runReport} disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Running…' : (result ? 'Re-run' : 'Run report')}
            </button>
          </>
        }
      >
        {runError && <div className="mb-4"><Alert variant="error">{runError}</Alert></div>}

        {/* Filter form */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Filters</span>
          </div>
          {Object.keys(filters).length === 0 ? (
            <p className="text-xs text-slate-500">This report takes no filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.keys(filters).map((k) => renderFilterField(k, filters[k]))}
            </div>
          )}
        </div>

        {/* Result preview */}
        {result && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-700">
                {result.run.rowCount.toLocaleString()} row{result.run.rowCount !== 1 ? 's' : ''}
                <span className="ml-2 text-xs text-slate-400">
                  ({result.run.durationMs}ms)
                </span>
              </p>
            </div>

            {result.columns && result.rows ? (
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c.key}
                          className={`whitespace-nowrap px-3 py-2 font-semibold text-slate-600 ${
                            c.align === 'right' ? 'text-right' : 'text-left'
                          }`}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {result.rows.slice(0, 200).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        {result.columns.map((c) => {
                          const raw = row[c.key];
                          const text = c.format
                            ? c.format(raw, row)
                            : (raw === null || raw === undefined ? '' : String(raw));
                          return (
                            <td key={c.key}
                              className={`whitespace-nowrap px-3 py-1.5 text-slate-700 ${
                                c.align === 'right' ? 'text-right font-mono' : ''
                              }`}>
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 200 && (
                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">
                    Showing first 200 of {result.rows.length} rows. Export CSV for full data.
                  </div>
                )}
              </div>
            ) : result.document ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-4 text-sm text-brand-800">
                This report returns a document. Use the dedicated generator page to produce a PDF.
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}