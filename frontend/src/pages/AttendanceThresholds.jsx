import { useEffect, useState, useCallback } from 'react';
import {
  Settings2, Plus, Pencil, Trash2, Loader2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Alert from '../components/ui/Alert';

const EMPTY = {
  departmentId: '', tardyMinutesMonthly: 60, undertimeMinutesMonthly: 60,
  absencesMonthly: 2, isActive: true,
};

export default function AttendanceThresholds() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('attendance.configure_alerts');

  const [thresholds, setThresholds] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d] = await Promise.all([
        api.get('/attendance/thresholds'),
        api.get('/departments'),
      ]);
      setThresholds(t.data.data.thresholds);
      setDepartments(d.data.data.departments ?? []);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({
      departmentId: t.departmentId ? String(t.departmentId) : '',
      tardyMinutesMonthly: t.tardyMinutesMonthly,
      undertimeMinutesMonthly: t.undertimeMinutesMonthly,
      absencesMonthly: t.absencesMonthly,
      isActive: t.isActive,
    });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFormError(null);
  };

  async function handleSubmit() {
    setFormError(null);

    const payload = {
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      tardyMinutesMonthly: Number(form.tardyMinutesMonthly),
      undertimeMinutesMonthly: Number(form.undertimeMinutesMonthly),
      absencesMonthly: Number(form.absencesMonthly),
      isActive: form.isActive,
    };

    // Sanity: if editing a global threshold, departmentId stays null
    if (editing?.departmentId === null) payload.departmentId = null;

    setSaving(true);
    try {
      if (editing) await api.put(`/attendance/thresholds/${editing.id}`, payload);
      else await api.post('/attendance/thresholds', payload);
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
      await api.delete(`/attendance/thresholds/${confirmDelete.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  // departments not yet covered by a specific threshold
  const coveredDeptIds = new Set(
    thresholds.filter((t) => t.departmentId !== null).map((t) => t.departmentId)
  );
  const availableDepts = departments.filter((d) => !coveredDeptIds.has(d.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Settings2 className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Attendance Thresholds
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Alert limits for monthly tardiness, undertime, and absences. Per-department rows override the global default.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && availableDepts.length > 0 && (
            <button type="button" onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              Add override
            </button>
          )}
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : thresholds.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No thresholds configured. The system will fall back to 60 min / 60 min / 2 days.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Scope
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Tardy (min/mo)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Undertime (min/mo)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Absences/mo
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Status
                </th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {thresholds.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    {t.departmentId === null ? (
                      <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                          Global default
                        </span>
                      </span>
                    ) : (
                      <>
                        <p className="font-medium text-slate-900">{t.departmentName}</p>
                        <p className="font-mono text-xs text-slate-400">{t.departmentCode}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {t.tardyMinutesMonthly}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {t.undertimeMinutesMonthly}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {t.absencesMonthly}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      t.isActive
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600 ring-slate-200'
                    }`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <button type="button" onClick={() => openEdit(t)} aria-label="Edit"
                          className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {t.departmentId !== null && (
                          <button type="button" onClick={() => setConfirmDelete(t)} aria-label="Delete"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        Employees are flagged when <strong>any</strong> of the applicable thresholds is exceeded.
        The global default cannot be deleted.
      </p>

      <Modal
        open={formOpen}
        onClose={saving ? () => {} : () => setFormOpen(false)}
        title={editing ? 'Edit threshold' : 'Add department override'}
        size="md"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add')}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><Alert variant="error">{formError}</Alert></div>}
        <div className="space-y-4">
          {!editing && (
            <div>
              <label htmlFor="dept" className="block text-sm font-medium text-slate-700">
                Department
              </label>
              <select id="dept" value={form.departmentId} onChange={update('departmentId')}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value="">— Select department —</option>
                {availableDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="tt" className="block text-sm font-medium text-slate-700">
                Tardy min/mo
              </label>
              <input id="tt" type="number" min="0" value={form.tardyMinutesMonthly}
                onChange={update('tardyMinutesMonthly')}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
            <div>
              <label htmlFor="ut" className="block text-sm font-medium text-slate-700">
                Undertime min/mo
              </label>
              <input id="ut" type="number" min="0" value={form.undertimeMinutesMonthly}
                onChange={update('undertimeMinutesMonthly')}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
            <div>
              <label htmlFor="ab" className="block text-sm font-medium text-slate-700">
                Absences/mo
              </label>
              <input id="ab" type="number" min="0" step="0.5" value={form.absencesMonthly}
                onChange={update('absencesMonthly')}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>

          <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={update('isActive')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete override?"
        message={`Delete the threshold override for "${confirmDelete?.departmentName}"? The department will fall back to the global default.`}
        confirmLabel="Delete"
      />
    </div>
  );
}