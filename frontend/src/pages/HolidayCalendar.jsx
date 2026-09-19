import { useEffect, useState, useCallback } from 'react';
import {
  Calendar, Plus, Pencil, Trash2, Loader2, RefreshCw, Flag,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

const TYPE_LABEL = {
  regular: 'Regular holiday',
  special_non_working: 'Special (non-working)',
  special_working: 'Special (working)',
};

const TYPE_BADGE = {
  regular: 'bg-rose-50 text-rose-700 ring-rose-200',
  special_non_working: 'bg-amber-50 text-amber-700 ring-amber-200',
  special_working: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const EMPTY = {
  holidayDate: '', name: '', holidayType: 'regular',
  isRecurring: false, legalBasis: '',
};

export default function HolidayCalendar() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage');
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [holidays, setHolidays] = useState([]);
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
      const params = year ? `?year=${year}` : '';
      const { data } = await api.get(`/holidays${params}`);
      setHolidays(data.data.holidays);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, holidayDate: `${year}-01-01` });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(h) {
    setEditing(h);
    setForm({
      holidayDate: h.holidayDate,
      name: h.name,
      holidayType: h.holidayType,
      isRecurring: h.isRecurring,
      legalBasis: h.legalBasis ?? '',
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
    if (!form.holidayDate) errs.holidayDate = 'Required.';
    if (!form.name.trim()) errs.name = 'Required.';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        holidayDate: form.holidayDate,
        name: form.name.trim(),
        holidayType: form.holidayType,
        isRecurring: form.isRecurring,
        legalBasis: form.legalBasis.trim() || null,
      };
      if (editing) await api.put(`/holidays/${editing.id}`, payload);
      else await api.post('/holidays', payload);
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
      await api.delete(`/holidays/${confirmDelete.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Calendar className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Holiday Calendar
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Legal holidays shade CS Form 48 and skip tardy/absent counters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button type="button" onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              Add holiday
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
        ) : holidays.length === 0 ? (
          <EmptyState
            Icon={Flag}
            title={`No holidays for ${year}`}
            description="Add Philippine legal holidays to shade them in DTRs."
            action={canManage && (
              <button type="button" onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
                <Plus className="h-4 w-4" />
                Add holiday
              </button>
            )}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {holidays.map((h) => {
              const date = new Date(h.holidayDate);
              const monthShort = date.toLocaleString('en-PH', { month: 'short' });
              return (
                <li key={h.id} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50/70">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <span className="text-[10px] font-medium uppercase leading-none">{monthShort}</span>
                    <span className="text-lg font-bold leading-none">{date.getDate()}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{h.name}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${TYPE_BADGE[h.holidayType]}`}>
                        {TYPE_LABEL[h.holidayType]}
                      </span>
                      {h.isRecurring && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Recurring
                        </span>
                      )}
                    </div>
                    {h.legalBasis && (
                      <p className="mt-0.5 text-xs text-slate-500">{h.legalBasis}</p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => openEdit(h)} aria-label="Edit"
                        className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(h)} aria-label="Delete"
                        className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Form modal */}
      <Modal
        open={formOpen}
        onClose={saving ? () => {} : () => setFormOpen(false)}
        title={editing ? 'Edit holiday' : 'Add holiday'}
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add')}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><Alert variant="error">{formError}</Alert></div>}
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Holiday name <span className="text-red-500">*</span>
            </label>
            <input id="name" value={form.name} onChange={update('name')}
              placeholder="e.g. Independence Day"
              className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
                fieldErrors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                                 : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
              }`} />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-slate-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input id="date" type="date" value={form.holidayDate} onChange={update('holidayDate')}
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
                  fieldErrors.holidayDate ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                                          : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                }`} />
              {fieldErrors.holidayDate && <p className="mt-1 text-xs text-red-600">{fieldErrors.holidayDate}</p>}
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium text-slate-700">Type</label>
              <select id="type" value={form.holidayType} onChange={update('holidayType')}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value="regular">Regular holiday</option>
                <option value="special_non_working">Special (non-working)</option>
                <option value="special_working">Special (working)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="legal" className="block text-sm font-medium text-slate-700">Legal basis</label>
            <input id="legal" value={form.legalBasis} onChange={update('legalBasis')}
              placeholder="e.g. Proclamation No. 1234, RA 9492"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>

          <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isRecurring} onChange={update('isRecurring')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            Recurs annually on this month/day
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete holiday?"
        message={`Delete "${confirmDelete?.name}"? Existing DTR entries will lose the holiday shading.`}
        confirmLabel="Delete"
      />
    </div>
  );
}