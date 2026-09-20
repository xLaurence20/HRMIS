import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, RefreshCw, Calendar,
  AlertCircle, Info,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

const CATEGORIES = [
  'regular', 'special', 'maternity', 'paternity',
  'study', 'rehabilitation', 'unpaid', 'other',
];
const ACCRUAL_METHODS = ['monthly', 'annual', 'one_time', 'manual_only'];

const EMPTY = {
  code: '', name: '', shortName: '', description: '', category: 'special',
  isPaid: true, isCredited: true, isEncashable: false,
  accrualMethod: 'manual_only', accrualAmount: 0, maxBalanceCap: '',
  maxDaysPerRequest: '', maxDaysPerYear: '', minNoticeDays: 0,
  allowsHalfDay: true, allowsNegativeBalance: false,
  requiresAttachment: false, attachmentHint: '',
  genderRestriction: '', colorHex: '#3b82f6', sortOrder: 100,
  isActive: true, legalBasis: '',
};

export default function LeaveTypesAdmin() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage', 'leave_credits.adjust');

  const [types, setTypes] = useState([]);
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
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/leave-types?activeOnly=false');
      setTypes(data.data.leaveTypes);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
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
      code: t.code, name: t.name, shortName: t.shortName ?? '',
      description: t.description ?? '', category: t.category,
      isPaid: t.isPaid, isCredited: t.isCredited, isEncashable: t.isEncashable,
      accrualMethod: t.accrualMethod, accrualAmount: t.accrualAmount,
      maxBalanceCap: t.maxBalanceCap ?? '',
      maxDaysPerRequest: t.maxDaysPerRequest ?? '', maxDaysPerYear: t.maxDaysPerYear ?? '',
      minNoticeDays: t.minNoticeDays, allowsHalfDay: t.allowsHalfDay,
      allowsNegativeBalance: t.allowsNegativeBalance,
      requiresAttachment: t.requiresAttachment, attachmentHint: t.attachmentHint ?? '',
      genderRestriction: t.genderRestriction ?? '', colorHex: t.colorHex ?? '#3b82f6',
      sortOrder: t.sortOrder, isActive: t.isActive, legalBasis: t.legalBasis ?? '',
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
    if (!form.name.trim()) errs.name = 'Required.';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      shortName: form.shortName.trim() || null,
      description: form.description.trim() || null,
      category: form.category,
      isPaid: form.isPaid,
      isCredited: form.isCredited,
      isEncashable: form.isEncashable,
      accrualMethod: form.accrualMethod,
      accrualAmount: Number(form.accrualAmount) || 0,
      maxBalanceCap: form.maxBalanceCap !== '' ? Number(form.maxBalanceCap) : null,
      maxDaysPerRequest: form.maxDaysPerRequest !== '' ? Number(form.maxDaysPerRequest) : null,
      maxDaysPerYear: form.maxDaysPerYear !== '' ? Number(form.maxDaysPerYear) : null,
      minNoticeDays: Number(form.minNoticeDays) || 0,
      allowsHalfDay: form.allowsHalfDay,
      allowsNegativeBalance: form.allowsNegativeBalance,
      requiresAttachment: form.requiresAttachment,
      attachmentHint: form.attachmentHint.trim() || null,
      genderRestriction: form.genderRestriction || null,
      colorHex: form.colorHex,
      sortOrder: Number(form.sortOrder) || 100,
      isActive: form.isActive,
      legalBasis: form.legalBasis.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) await api.put(`/leave-types/${editing.id}`, payload);
      else await api.post('/leave-types', payload);
      setFormOpen(false);
      load();
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setFormError(message);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/leave-types/${confirmDelete.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
      setConfirmDelete(null);
    } finally { setDeleting(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Calendar className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Leave Types</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Catalogue of leave types, accrual rules, and eligibility constraints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button type="button" onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              New leave type
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
        ) : types.length === 0 ? (
          <EmptyState Icon={Calendar} title="No leave types configured" description="Add CSC-compliant leave types to enable filing." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Code','Name','Category','Accrual','Balance cap','Half day','Active',''].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.colorHex }} />
                        <span className="font-mono text-xs font-medium text-slate-800">{t.code}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.name}</p>
                      {t.description && <p className="truncate text-xs text-slate-500">{t.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.accrualMethod === 'manual_only' ? (
                        <span className="text-xs text-slate-400">manual</span>
                      ) : (
                        <>
                          <span className="font-mono">{t.accrualAmount}</span>
                          <span className="ml-1 text-xs text-slate-500">/{t.accrualMethod}</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                      {t.maxBalanceCap != null ? t.maxBalanceCap : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.allowsHalfDay ? '✓' : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        t.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                   : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="inline-flex items-center gap-0.5">
                          <button type="button" onClick={() => openEdit(t)} aria-label="Edit"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(t)} aria-label="Delete"
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
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={saving ? () => {} : () => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New leave type'}
        size="2xl"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create')}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><Alert variant="error">{formError}</Alert></div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field id="code" label="Code" required value={form.code} onChange={update('code')}
            error={fieldErrors.code} placeholder="VL, SL, SPL…" />

          <Field id="name" label="Full name" required value={form.name} onChange={update('name')}
            error={fieldErrors.name} />

          <Field id="shortName" label="Short name" value={form.shortName} onChange={update('shortName')} />

          <SelectField id="category" label="Category" value={form.category} onChange={update('category')}
            options={CATEGORIES} />

          <div className="lg:col-span-2">
            <label htmlFor="desc" className="block text-sm font-medium text-slate-700">Description</label>
            <textarea id="desc" rows={2} value={form.description} onChange={update('description')}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>

          <SelectField id="accrualMethod" label="Accrual method"
            value={form.accrualMethod} onChange={update('accrualMethod')}
            options={ACCRUAL_METHODS} />

          <Field id="accrualAmount" label="Accrual amount (days)"
            type="number" step="0.25" min="0"
            value={form.accrualAmount} onChange={update('accrualAmount')} />

          <Field id="maxBalanceCap" label="Max balance cap (days)"
            type="number" step="0.25" min="0"
            value={form.maxBalanceCap} onChange={update('maxBalanceCap')}
            placeholder="blank = uncapped" />

          <Field id="minNoticeDays" label="Minimum advance notice (days)"
            type="number" min="0" max="90"
            value={form.minNoticeDays} onChange={update('minNoticeDays')} />

          <Field id="maxDaysPerRequest" label="Max days per filing"
            type="number" step="0.5" min="0"
            value={form.maxDaysPerRequest} onChange={update('maxDaysPerRequest')} />

          <Field id="maxDaysPerYear" label="Max days per year"
            type="number" step="0.5" min="0"
            value={form.maxDaysPerYear} onChange={update('maxDaysPerYear')} />

          <SelectField id="genderRestriction" label="Gender restriction"
            value={form.genderRestriction} onChange={update('genderRestriction')}
            options={[{ value: '', label: '— None —' }, { value: 'Male', label: 'Male only' }, { value: 'Female', label: 'Female only' }]} />

          <div>
            <label htmlFor="color" className="block text-sm font-medium text-slate-700">Color</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input id="color" type="color" value={form.colorHex} onChange={update('colorHex')}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300" />
              <input type="text" value={form.colorHex} onChange={update('colorHex')}
                className="block flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>

          <Field id="sortOrder" label="Sort order" type="number" min="0"
            value={form.sortOrder} onChange={update('sortOrder')} />

          <Field id="legalBasis" label="Legal basis"
            value={form.legalBasis} onChange={update('legalBasis')}
            placeholder="RA 11210, CSC MC 41 s.1998" />

          <div className="lg:col-span-2">
            <label htmlFor="attachHint" className="block text-sm font-medium text-slate-700">Attachment hint</label>
            <input id="attachHint" value={form.attachmentHint} onChange={update('attachmentHint')}
              placeholder="Medical certificate required for absences exceeding 3 days"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 rounded-lg bg-slate-50 px-4 py-3">
          <Check label="Paid" checked={form.isPaid} onChange={update('isPaid')} />
          <Check label="Credited (tracks balance)" checked={form.isCredited} onChange={update('isCredited')} />
          <Check label="Encashable" checked={form.isEncashable} onChange={update('isEncashable')} />
          <Check label="Half-day allowed" checked={form.allowsHalfDay} onChange={update('allowsHalfDay')} />
          <Check label="Negative balance allowed" checked={form.allowsNegativeBalance} onChange={update('allowsNegativeBalance')} />
          <Check label="Attachment required" checked={form.requiresAttachment} onChange={update('requiresAttachment')} />
          <Check label="Active" checked={form.isActive} onChange={update('isActive')} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete leave type?"
        message={`Delete "${confirmDelete?.name}"? Applications already using this type will block the delete.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

function Field({ id, label, required, error, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input id={id}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SelectField({ id, label, options, ...rest }) {
  const norm = options.map((o) => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <select id={id}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        {...rest}>
        {norm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check({ label, ...rest }) {
  return (
    <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
      <input type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        {...rest} />
      {label}
    </label>
  );
}