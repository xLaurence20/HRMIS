import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, AlertCircle, Calendar as CalendarIcon,
  Info, Paperclip,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toDateOnly(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function LeaveApplicationForm() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [employees, setEmployees] = useState([]);       // for HR "file on behalf"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    leaveTypeId: '',
    employeeId: '',
    startDate: '',
    endDate: '',
    startHalf: '',
    endHalf: '',
    reason: '',
    attachmentPath: '',
    contactAddress: '',
    contactPhone: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const isHR = hasPermission('employees.update');

  useEffect(() => {
    (async () => {
      try {
        const [typesRes, balRes] = await Promise.all([
          api.get('/leave-types'),
          api.get('/leave-credits/me'),
        ]);
        setLeaveTypes(typesRes.data.data.leaveTypes);
        setBalances(balRes.data.data.balances ?? []);

        if (isHR) {
          const empRes = await api.get('/employees?limit=500&activeOnly=true');
          setEmployees(empRes.data.data.employees ?? []);
        }
      } catch (err) {
        setError(extractApiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isHR]);

  const selectedType = useMemo(
    () => leaveTypes.find((t) => String(t.id) === String(form.leaveTypeId)),
    [leaveTypes, form.leaveTypeId]
  );

  const currentBalance = useMemo(() => {
    if (!selectedType) return null;
    if (form.employeeId) return null; // HR view — no balance shown
    const b = balances.find((bb) => bb.leaveTypeId === selectedType.id);
    return b ? b.balance : 0;
  }, [balances, selectedType, form.employeeId]);

  // Live day count preview (excludes weekends; holidays require server check)
  const dayPreview = useMemo(() => {
    if (!form.startDate || !form.endDate) return null;
    const start = toDateOnly(form.startDate);
    const end = toDateOnly(form.endDate);
    if (!start || !end || start > end) return null;

    const single = start.getTime() === end.getTime();
    if (single) {
      if (form.startHalf && form.endHalf) return { days: 1.0, weekends: 0 };
      if (form.startHalf || form.endHalf) return { days: 0.5, weekends: 0 };
      return { days: 1.0, weekends: 0 };
    }

    let days = 0, weekends = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const isWknd = cursor.getDay() === 0 || cursor.getDay() === 6;
      if (isWknd) weekends++;
      else {
        let amount = 1.0;
        if (cursor.getTime() === start.getTime() && form.startHalf) amount = 0.5;
        if (cursor.getTime() === end.getTime() && form.endHalf) amount = 0.5;
        days += amount;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days: Math.round(days * 100) / 100, weekends };
  }, [form.startDate, form.endDate, form.startHalf, form.endHalf]);

  const isSingleDay = form.startDate && form.endDate && form.startDate === form.endDate;

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setServerError(null);
  };

  // When start date is picked, default end date to same day
  function onStartChange(e) {
    const v = e.target.value;
    setForm((f) => ({
      ...f,
      startDate: v,
      endDate: f.endDate && f.endDate >= v ? f.endDate : v,
    }));
  }

  function validate() {
    const e = {};
    if (!form.leaveTypeId) e.leaveTypeId = 'Select a leave type.';
    if (!form.startDate) e.startDate = 'Required.';
    if (!form.endDate) e.endDate = 'Required.';
    if (form.endDate < form.startDate) e.endDate = 'End date must be on or after start date.';
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      e.reason = 'Please provide a reason (at least 5 characters).';
    }
    if (selectedType?.requiresAttachment && !form.attachmentPath.trim()) {
      e.attachmentPath = selectedType.attachmentHint || 'Required for this leave type.';
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);

    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      leaveTypeId: Number(form.leaveTypeId),
      startDate: form.startDate,
      endDate: form.endDate,
      startHalf: form.startHalf || null,
      endHalf: form.endHalf || null,
      reason: form.reason.trim(),
      attachmentPath: form.attachmentPath.trim() || null,
      contactAddress: form.contactAddress.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
    };
    if (isHR && form.employeeId) payload.employeeId = Number(form.employeeId);

    setSubmitting(true);
    try {
      const { data } = await api.post('/leaves', payload);
      navigate(`/leaves/${data.data.application.id}`);
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  const showBalance = selectedType?.isCredited && !form.employeeId && currentBalance !== null;
  const insufficient = showBalance && dayPreview && currentBalance < dayPreview.days;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link to="/leaves/my" className="hover:text-brand-600">My Leaves</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">File a new application</span>
      </nav>

      <header className="mt-4 border-b border-slate-200 pb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          File Leave Application
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Your application will be routed through the approval workflow automatically.
        </p>
      </header>

      {error && <div className="mt-6"><Alert variant="error">{error}</Alert></div>}
      {serverError && <div className="mt-6"><Alert variant="error" title="Could not submit">{serverError}</Alert></div>}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6">
        {/* Leave type */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="leaveType" className="block text-sm font-medium text-slate-700">
            Leave type <span className="text-red-500">*</span>
          </label>
          <select id="leaveType" value={form.leaveTypeId} onChange={update('leaveTypeId')}
            className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
              fieldErrors.leaveTypeId
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
            }`}>
            <option value="">— Select leave type —</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
          {fieldErrors.leaveTypeId && <p className="mt-1 text-xs text-red-600">{fieldErrors.leaveTypeId}</p>}

          {selectedType && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="flex-1 space-y-0.5">
                  {selectedType.description && <p>{selectedType.description}</p>}
                  {selectedType.legalBasis && <p className="text-slate-500">Legal basis: {selectedType.legalBasis}</p>}
                  {selectedType.minNoticeDays > 0 && (
                    <p className="text-amber-700">Requires {selectedType.minNoticeDays} day(s) advance notice.</p>
                  )}
                  {selectedType.requiresAttachment && (
                    <p className="text-amber-700">Attachment required: {selectedType.attachmentHint || 'see HR'}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* HR: file on behalf */}
        {isHR && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
            <label htmlFor="employee" className="block text-sm font-medium text-amber-900">
              File on behalf of (optional)
            </label>
            <select id="employee" value={form.employeeId} onChange={update('employeeId')}
              className="mt-1.5 block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">
              <option value="">— File for myself —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeNumber})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-amber-700">
              As HR you can file on behalf of any active employee.
            </p>
          </div>
        )}

        {/* Dates */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Dates</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-slate-700">
                Start date <span className="text-red-500">*</span>
              </label>
              <input id="startDate" type="date" value={form.startDate} onChange={onStartChange}
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                  fieldErrors.startDate
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                }`} />
              {fieldErrors.startDate && <p className="mt-1 text-xs text-red-600">{fieldErrors.startDate}</p>}
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-slate-700">
                End date <span className="text-red-500">*</span>
              </label>
              <input id="endDate" type="date" value={form.endDate}
                min={form.startDate}
                onChange={update('endDate')}
                disabled={isSingleDay}
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 disabled:bg-slate-50 ${
                  fieldErrors.endDate
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                }`} />
              {fieldErrors.endDate && <p className="mt-1 text-xs text-red-600">{fieldErrors.endDate}</p>}
            </div>
          </div>

          {/* Half-day toggles: only enabled for single-day, and only if type allows */}
          {isSingleDay && selectedType?.allowsHalfDay && (
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Half-day? (optional)</p>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox"
                    checked={form.startHalf === 'AM'}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      startHalf: e.target.checked ? 'AM' : (f.startHalf === 'AM' ? '' : f.startHalf),
                    }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Morning only (AM)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox"
                    checked={form.endHalf === 'PM'}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      endHalf: e.target.checked ? 'PM' : (f.endHalf === 'PM' ? '' : f.endHalf),
                    }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Afternoon only (PM)
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Leave one or both unchecked for a full day.
              </p>
            </div>
          )}

          {/* Live preview */}
          {dayPreview && selectedType && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm">
              <div>
                <p className="text-xs text-brand-700">Computed days (approx.)</p>
                <p className="text-2xl font-bold text-brand-900">{dayPreview.days}</p>
              </div>
              {dayPreview.weekends > 0 && (
                <div>
                  <p className="text-xs text-brand-700">Weekends skipped</p>
                  <p className="text-2xl font-bold text-brand-900">{dayPreview.weekends}</p>
                </div>
              )}
              {showBalance && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-brand-700">Available balance</p>
                  <p className={`text-lg font-semibold ${
                    insufficient ? 'text-red-700' : 'text-emerald-700'
                  }`}>
                    {currentBalance.toFixed(3)} day(s)
                  </p>
                  {insufficient && (
                    <p className="text-[11px] font-medium text-red-700">Insufficient credits</p>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] text-slate-500">
            Weekends and Philippine holidays are automatically excluded. Final day count is verified by the server on submit.
          </p>
        </div>

        {/* Reason */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="reason" className="block text-sm font-medium text-slate-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea id="reason" rows={3} value={form.reason} onChange={update('reason')}
            placeholder="Briefly state the reason for this leave."
            className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
              fieldErrors.reason
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
            }`} />
          {fieldErrors.reason && <p className="mt-1 text-xs text-red-600">{fieldErrors.reason}</p>}
        </div>

        {/* Attachment + contact */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <label htmlFor="attach" className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
              Attachment URL
              {selectedType?.requiresAttachment && <span className="text-red-500">*</span>}
            </label>
            <input id="attach" type="url" value={form.attachmentPath} onChange={update('attachmentPath')}
              placeholder="https://drive.google.com/... or /uploads/medical-cert.pdf"
              className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                fieldErrors.attachmentPath
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                  : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
              }`} />
            {fieldErrors.attachmentPath && <p className="mt-1 text-xs text-red-600">{fieldErrors.attachmentPath}</p>}
            <p className="mt-1 text-[11px] text-slate-500">
              File uploads will be enabled in a later phase. For now, paste a URL to the document.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactAddress" className="block text-sm font-medium text-slate-700">
                Contact address while on leave
              </label>
              <input id="contactAddress" value={form.contactAddress} onChange={update('contactAddress')}
                placeholder="123 Main St, Barangay, City"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-slate-700">
                Contact phone
              </label>
              <input id="contactPhone" value={form.contactPhone} onChange={update('contactPhone')}
                placeholder="+63 912 345 6789"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <button type="button" onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={submitting || insufficient}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  );
}