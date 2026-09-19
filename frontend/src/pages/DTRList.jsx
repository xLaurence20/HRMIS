import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, CalendarClock, Eye, Plus, RefreshCw, Upload, FileText,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/ui/Pagination';
import DataTableShell from '../components/ui/DataTableShell';
import DTRUploadModal from '../components/DTRUploadModal';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';

const STATUS_STYLES = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  verified:  'bg-brand-50 text-brand-700 ring-brand-200',
  locked:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function DTRList() {
  const { hasPermission } = useAuth();
  const now = new Date();

  const [periods, setPeriods] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: '', periodYear: String(now.getFullYear()), periodMonth: String(now.getMonth() + 1),
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const canUpload = hasPermission('dtr.upload');
  const canCorrect = hasPermission('dtr.correct');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const [d, e] = await Promise.all([
          api.get('/departments'),
          api.get('/employees?limit=500&activeOnly=true'),
        ]);
        setDepartments(d.data.data.departments ?? []);
        setEmployees(e.data.data.employees ?? []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', pagination.page);
      params.set('limit', pagination.limit);
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      if (status) params.set('status', status);
      if (departmentId) params.set('departmentId', departmentId);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const { data } = await api.get(`/dtr/periods?${params.toString()}`);
      setPeriods(data.data.periods);
      setPagination((p) => ({ ...p, total: data.data.pagination.total }));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, year, month, status, departmentId, debouncedSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [year, month, status, departmentId, debouncedSearch]);

  async function handleCreate() {
    setCreateError(null);
    if (!createForm.employeeId) { setCreateError('Select an employee.'); return; }

    setCreating(true);
    try {
      const { data } = await api.post('/dtr/periods', {
        employeeId: Number(createForm.employeeId),
        periodYear: Number(createForm.periodYear),
        periodMonth: Number(createForm.periodMonth),
      });
      setCreateOpen(false);
      load();
      // Navigate straight to the new period
      window.location.href = `/dtr/${data.data.period.id}`;
    } catch (err) {
      const { message, details } = extractApiError(err);
      // If a period already exists, jump to it
      if (details?.periodId) {
        window.location.href = `/dtr/${details.periodId}`;
        return;
      }
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <CalendarClock className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Daily Time Records
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Monthly DTR periods. Each period contains one log per calendar day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {canUpload && (
            <button type="button" onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Upload CSV
            </button>
          )}

          {canCorrect && (
            <button type="button" onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              New period
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>

        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All years</option>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="verified">Verified</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataTableShell
          loading={loading}
          error={error}
          isEmpty={!loading && !error && periods.length === 0}
          emptyProps={{
            Icon: FileText,
            title: 'No DTR periods found',
            description: 'Create a period or upload a CSV to get started.',
          }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Department', 'Period', 'Days', 'Status', ''].map((h) => (
                    <th key={h} scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((p) => (
                  <tr key={p.id} className="cursor-pointer transition hover:bg-brand-50/40"
                      onClick={() => window.location.href = `/dtr/${p.id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.fullName}</p>
                      <p className="font-mono text-xs text-slate-400">{p.employeeNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{p.departmentName ?? '—'}</p>
                      {p.departmentCode && (
                        <p className="font-mono text-xs text-slate-400">{p.departmentCode}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                      {p.periodLabel}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.logCount ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/dtr/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Open"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50">
                        <Eye className="h-3.5 w-3.5" />
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTableShell>

        {!loading && !error && periods.length > 0 && (
          <Pagination
            page={pagination.page} limit={pagination.limit} total={pagination.total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
          />
        )}
      </div>

      {/* CSV upload modal */}
      <DTRUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { load(); }}
      />

      {/* New period modal */}
      <Modal
        open={createOpen}
        onClose={creating ? () => {} : () => setCreateOpen(false)}
        title="New DTR period"
        description="Creates one row for every calendar day of the month."
        size="md"
        closeOnBackdrop={!creating}
        footer={
          <>
            <button type="button" onClick={() => setCreateOpen(false)} disabled={creating}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleCreate} disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {creating ? 'Creating…' : 'Create period'}
            </button>
          </>
        }
      >
        {createError && <div className="mb-4"><Alert variant="error">{createError}</Alert></div>}
        <div className="space-y-4">
          <div>
            <label htmlFor="emp" className="block text-sm font-medium text-slate-700">
              Employee <span className="text-red-500">*</span>
            </label>
            <select id="emp" value={createForm.employeeId}
              onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeNumber})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="py" className="block text-sm font-medium text-slate-700">Year</label>
              <select id="py" value={createForm.periodYear}
                onChange={(e) => setCreateForm((f) => ({ ...f, periodYear: e.target.value }))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pm" className="block text-sm font-medium text-slate-700">Month</label>
              <select id="pm" value={createForm.periodMonth}
                onChange={(e) => setCreateForm((f) => ({ ...f, periodMonth: e.target.value }))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}