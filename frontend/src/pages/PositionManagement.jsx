import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Briefcase,
  RefreshCw, Building2,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import DataTableShell from '../components/ui/DataTableShell';

const LEVELS = ['1st Level','2nd Level','3rd Level'];
const CLASSES = ['Executive/Managerial','Professional','Sub-professional','Rank-and-File','Legislative'];

const EMPTY = {
  code: '', title: '', departmentId: '',
  salaryGrade: '', step: 1, positionClass: '', level: '',
  isPlantilla: true, isSupervisory: false, isTeaching: false,
  monthlyRate: '', isActive: true,
};

export default function PositionManagement() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('positions.manage');

  const [positions, setPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [level, setLevel] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/departments');
        setDepartments(data.data.departments ?? []);
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
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (departmentId) params.set('departmentId', departmentId);
      if (level) params.set('level', level);
      params.set('activeOnly', 'false');

      const { data } = await api.get(`/positions?${params.toString()}`);
      setPositions(data.data.positions);
      setPagination((p) => ({ ...p, total: data.data.pagination.total }));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch, departmentId, level]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [debouncedSearch, departmentId, level]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setForm({
      code: p.code,
      title: p.title,
      departmentId: p.departmentId ? String(p.departmentId) : '',
      salaryGrade: p.salaryGrade ?? '',
      step: p.step ?? 1,
      positionClass: p.positionClass ?? '',
      level: p.level ?? '',
      isPlantilla: p.isPlantilla,
      isSupervisory: p.isSupervisory,
      isTeaching: p.isTeaching,
      monthlyRate: p.monthlyRate ?? '',
      isActive: p.isActive,
    });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setFormError(null);
  };

  async function handleSubmit() {
    setFormError(null);
    const errs = {};
    if (!form.code.trim()) errs.code = 'Required.';
    if (!form.title.trim()) errs.title = 'Required.';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      salaryGrade: form.salaryGrade !== '' ? Number(form.salaryGrade) : null,
      step: Number(form.step) || 1,
      positionClass: form.positionClass || null,
      level: form.level || null,
      isPlantilla: form.isPlantilla,
      isSupervisory: form.isSupervisory,
      isTeaching: form.isTeaching,
      monthlyRate: form.monthlyRate !== '' ? Number(form.monthlyRate) : null,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editing) await api.put(`/positions/${editing.id}`, payload);
      else await api.post('/positions', payload);
      setFormOpen(false);
      load();
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/positions/${confirmDelete.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Briefcase className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Position Management
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Plantilla items, salary grades, and supervisory designations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canManage && (
            <button type="button" onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              New position
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or code…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataTableShell
          loading={loading}
          error={error}
          isEmpty={!loading && !error && positions.length === 0}
          emptyProps={{
            Icon: Briefcase,
            title: 'No positions found',
            description: 'Create a position to begin building the plantilla.',
          }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Code','Title','Department','SG / Step','Class','Filled','Status',''].map((h) => (
                    <th key={h} scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                      {p.code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{p.title}</span>
                        {p.isSupervisory && (
                          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                            Supervisory
                          </span>
                        )}
                      </div>
                      {p.monthlyRate != null && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          ₱{p.monthlyRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.departmentName ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {p.salaryGrade != null ? `SG-${p.salaryGrade}` : '—'}
                      {p.step ? ` / Step ${p.step}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {p.positionClass ?? '—'}
                      {p.level && <p className="text-slate-400">{p.level}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {p.filledCount ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        p.isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="inline-flex items-center gap-0.5">
                          <button type="button" onClick={() => openEdit(p)} aria-label="Edit"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(p)} aria-label="Delete"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTableShell>

        {!loading && !error && positions.length > 0 && (
          <Pagination
            page={pagination.page} limit={pagination.limit} total={pagination.total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
          />
        )}
      </div>

      {/* Form modal */}
      <Modal
        open={formOpen}
        onClose={saving ? () => {} : () => setFormOpen(false)}
        title={editing ? 'Edit position' : 'New position'}
        size="lg"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create')}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><Alert variant="error">{formError}</Alert></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id="code" label="Code" required value={form.code} onChange={update('code')}
              error={fieldErrors.code} placeholder="PL-0001" />
            <Field id="title" label="Title" required value={form.title} onChange={update('title')}
              error={fieldErrors.title} placeholder="Administrative Officer II" />
          </div>

          <SelectField id="departmentId" label="Department"
            value={form.departmentId} onChange={update('departmentId')}
            options={[
              { value: '', label: '— None —' },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]} />

          <div className="grid grid-cols-3 gap-4">
            <Field id="salaryGrade" label="Salary grade" type="number" min="1" max="33"
              value={form.salaryGrade} onChange={update('salaryGrade')} />
            <Field id="step" label="Step" type="number" min="1" max="8"
              value={form.step} onChange={update('step')} />
            <Field id="monthlyRate" label="Monthly rate" type="number" step="0.01" min="0"
              value={form.monthlyRate} onChange={update('monthlyRate')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField id="positionClass" label="Position class"
              value={form.positionClass} onChange={update('positionClass')}
              options={[{ value: '', label: '— None —' }, ...CLASSES.map((c) => ({ value: c, label: c }))]} />
            <SelectField id="level" label="Level"
              value={form.level} onChange={update('level')}
              options={[{ value: '', label: '— None —' }, ...LEVELS.map((l) => ({ value: l, label: l }))]} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg bg-slate-50 px-4 py-3">
            <Check label="Plantilla" checked={form.isPlantilla} onChange={update('isPlantilla')} />
            <Check label="Supervisory" checked={form.isSupervisory} onChange={update('isSupervisory')} />
            <Check label="Teaching" checked={form.isTeaching} onChange={update('isTeaching')} />
            <Check label="Active" checked={form.isActive} onChange={update('isActive')} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete position?"
        message={`Delete "${confirmDelete?.title}"? Employees must be reassigned to another position first.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

const Field = ({ id, label, required, error, ...rest }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    <input id={id} aria-invalid={Boolean(error)}
      className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
        error ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
      }`} {...rest} />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

const SelectField = ({ id, label, options, ...rest }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <select id={id}
      className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Check = ({ label, ...rest }) => (
  <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
    <input type="checkbox"
      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      {...rest} />
    {label}
  </label>
);