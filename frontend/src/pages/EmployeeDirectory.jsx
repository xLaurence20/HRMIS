import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Filter, Eye, Pencil, Users,
  RefreshCw, Download, Building2, BadgeCheck,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/ui/Pagination';
import DataTableShell from '../components/ui/DataTableShell';
import Alert from '../components/ui/Alert';

const STATUS_OPTIONS = [
  'Permanent','Temporary','Coterminous','Casual','Contractual',
  'Job Order','Contract of Service','Substitute','Provisional',
  'Emergency','Separated','Retired',
];

const statusBadgeClass = (status) => {
  if (['Permanent'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['Temporary','Provisional','Substitute','Emergency'].includes(status))
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (['Separated','Retired'].includes(status))
    return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-brand-50 text-brand-700 ring-brand-200';
};

export default function EmployeeDirectory() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const canCreate = hasPermission('employees.create');

  /* ---------------------------------------------------------------- *
   *  Debounce search
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* ---------------------------------------------------------------- *
   *  Load departments once
   * ---------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/departments');
        setDepartments(data.data.departments ?? []);
      } catch {
        /* Non-fatal — filter just won't have options */
      }
    })();
  }, []);

  /* ---------------------------------------------------------------- *
   *  Load employees
   * ---------------------------------------------------------------- */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', pagination.page);
      params.set('limit', pagination.limit);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (departmentId) params.set('departmentId', departmentId);
      if (status) params.set('status', status);
      params.set('activeOnly', activeOnly ? 'true' : 'false');

      const { data } = await api.get(`/employees?${params.toString()}`);
      setEmployees(data.data.employees);
      setPagination((p) => ({ ...p, total: data.data.pagination.total }));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch, departmentId, status, activeOnly]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [debouncedSearch, departmentId, status, activeOnly]);

  const activeFilterCount = useMemo(
    () => [departmentId, status, !activeOnly].filter(Boolean).length,
    [departmentId, status, activeOnly]
  );

  const clearFilters = () => {
    setSearch(''); setDepartmentId(''); setStatus(''); setActiveOnly(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Users className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Employee Directory
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Master list of personnel. Click any row to view the full record.
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
          {canCreate && (
            <button
              type="button"
              onClick={() => navigate('/employees/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              New employee
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number…"
            aria-label="Search employees"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Filter by department"
            className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by employment status"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="inline-flex select-none items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={!activeOnly}
            onChange={(e) => setActiveOnly(!e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Include inactive
        </label>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Filter className="h-3.5 w-3.5" />
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataTableShell
          loading={loading}
          error={error}
          isEmpty={!loading && !error && employees.length === 0}
          emptyProps={{
            Icon: Users,
            title: 'No employees found',
            description: activeFilterCount
              ? 'Try adjusting your filters or search term.'
              : 'Get started by adding your first employee record.',
            action: canCreate && activeFilterCount === 0 ? (
              <button
                type="button"
                onClick={() => navigate('/employees/new')}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Add employee
              </button>
            ) : null,
          }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Department', 'Position', 'Status', 'Date Hired', 'Account', ''].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="cursor-pointer transition hover:bg-brand-50/40"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        {emp.photoPath ? (
                          <img src={emp.photoPath} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {(emp.firstName?.[0] ?? '') + (emp.lastName?.[0] ?? '')}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{emp.fullName}</p>
                          <p className="font-mono text-xs text-slate-400">
                            {emp.employeeNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {emp.departmentName ? (
                        <>
                          <p className="text-slate-700">{emp.departmentName}</p>
                          <p className="font-mono text-xs text-slate-400">{emp.departmentCode}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {emp.positionTitle ? (
                        <>
                          <p className="text-slate-700">{emp.positionTitle}</p>
                          {emp.salaryGrade != null && (
                            <p className="text-xs text-slate-400">
                              SG-{emp.salaryGrade}
                              {emp.stepIncrement ? ` / Step ${emp.stepIncrement}` : ''}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(emp.employmentStatus)}`}>
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {emp.dateHired ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {emp.userId ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          {emp.username}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">no login</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/employees/${emp.id}`); }}
                        aria-label="View"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTableShell>

        {!loading && !error && employees.length > 0 && (
          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
          />
        )}
      </div>
    </div>
  );
}