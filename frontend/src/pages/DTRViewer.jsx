import { Fragment, useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Save, Printer, CheckCircle2, Lock, Undo2,
  Send, RefreshCw, Pencil, X, AlertCircle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  locked: 'Locked',
};

const STATUS_BADGE = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  verified:  'bg-brand-50 text-brand-700 ring-brand-200',
  locked:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—');

/**
 * Parse a date string into a local-time Date.
 * Accepts 'YYYY-MM-DD' or an ISO string starting with that.
 * Always uses local-time constructor so getDate()/getDay() are correct.
 */
function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function DTRViewer() {
  const { id } = useParams();
  const { hasPermission } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editLogId, setEditLogId] = useState(null);
  const [editBuffer, setEditBuffer] = useState(null);
  const [savingLog, setSavingLog] = useState(false);

  const [transitioning, setTransitioning] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState(null);

  const canCorrect = hasPermission('dtr.correct');
  const canVerify = hasPermission('dtr.verify');
  const canPrint = hasPermission('dtr.print', 'dtr.view');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get(`/dtr/periods/${id}`);
      setData(res.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isEditable = data?.period?.status === 'draft' && canCorrect;

  function startEdit(log) {
    setEditLogId(log.id);
    setEditBuffer({
      amArrival: log.amArrival ?? '',
      amDeparture: log.amDeparture ?? '',
      pmArrival: log.pmArrival ?? '',
      pmDeparture: log.pmDeparture ?? '',
      overtimeIn: log.overtimeIn ?? '',
      overtimeOut: log.overtimeOut ?? '',
      tardinessMinutes: log.tardinessMinutes ?? 0,
      undertimeMinutes: log.undertimeMinutes ?? 0,
      overtimeMinutes: log.overtimeMinutes ?? 0,
      hoursWorked: log.hoursWorked ?? 0,
      isAbsent: log.isAbsent,
      isLeave: log.isLeave,
      leaveType: log.leaveType ?? '',
      leaveHours: log.leaveHours ?? '',
      isLwop: log.isLwop,
      remarks: log.remarks ?? '',
    });
  }

  function cancelEdit() {
    setEditLogId(null);
    setEditBuffer(null);
  }

  async function saveLog() {
    if (!editBuffer) return;
    setSavingLog(true);
    try {
      // Coerce and sanitize the buffer for the API
      const payload = {
        amArrival:     editBuffer.amArrival     || null,
        amDeparture:   editBuffer.amDeparture   || null,
        pmArrival:     editBuffer.pmArrival     || null,
        pmDeparture:   editBuffer.pmDeparture   || null,
        overtimeIn:    editBuffer.overtimeIn    || null,
        overtimeOut:   editBuffer.overtimeOut   || null,
        tardinessMinutes: Number(editBuffer.tardinessMinutes) || 0,
        undertimeMinutes: Number(editBuffer.undertimeMinutes) || 0,
        overtimeMinutes:  Number(editBuffer.overtimeMinutes)  || 0,
        hoursWorked:      Number(editBuffer.hoursWorked)      || 0,
        isAbsent:         Boolean(editBuffer.isAbsent),
        isLeave:          Boolean(editBuffer.isLeave),
        leaveType:        editBuffer.isLeave ? (editBuffer.leaveType || null) : null,
        leaveHours:       editBuffer.isLeave && editBuffer.leaveHours !== ''
                            ? Number(editBuffer.leaveHours)
                            : null,
        isLwop:           Boolean(editBuffer.isLwop),
        remarks:          editBuffer.remarks || null,
      };
      await api.put(`/dtr/logs/${editLogId}`, payload);
      cancelEdit();
      await load();
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setSavingLog(false);
    }
  }

  async function handleTransition(nextStatus) {
    setTransitioning(true);
    try {
      await api.put(`/dtr/periods/${id}/status`, { status: nextStatus });
      setConfirmTransition(null);
      await load();
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Alert variant="error" title="Could not load DTR">{error}</Alert>
        <Link to="/dtr" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to list
        </Link>
      </div>
    );
  }

  const { period, logs, summary } = data;
  const monthLabel = `${MONTHS[period.periodMonth - 1]} ${period.periodYear}`;

  const allowedActions = [];
  if (period.status === 'draft' && canVerify) allowedActions.push({ to: 'submitted', label: 'Submit for review', Icon: Send });
  if (period.status === 'submitted' && canVerify) allowedActions.push({ to: 'verified', label: 'Mark as verified', Icon: CheckCircle2 });
  if (period.status === 'verified' && canVerify) allowedActions.push({ to: 'locked', label: 'Lock period', Icon: Lock });
  if (period.status === 'submitted' && canVerify) allowedActions.push({ to: 'draft', label: 'Send back to draft', Icon: Undo2 });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link to="/dtr" className="hover:text-brand-600">Daily Time Records</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{period.fullName} · {monthLabel}</span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {period.fullName}
            </h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[period.status]}`}>
              {STATUS_LABEL[period.status]}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {period.employeeNumber} · {period.departmentName ?? '—'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            DTR period: <strong>{monthLabel}</strong> · {logs.length} days
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/dtr"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canPrint && (
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              <Printer className="h-4 w-4" />
              Print
            </button>
          )}
          {allowedActions.map(({ to, label, Icon }) => (
            <button key={to} type="button" onClick={() => setConfirmTransition({ to, label })}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${
                to === 'draft'
                  ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : to === 'locked'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mt-6">
          <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {period.status === 'locked' && (
        <div className="mt-6">
          <Alert variant="success" title="Period is locked">
            This DTR is signed off and cannot be edited. Contact an administrator to reopen it.
          </Alert>
        </div>
      )}

      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Working days" value={summary.workingDays} />
          <StatCard label="Days worked" value={summary.daysWorked} tone="emerald" />
          <StatCard label="Absences" value={summary.daysAbsent} tone={summary.daysAbsent > 0 ? 'red' : 'neutral'} />
          <StatCard label="Leave days" value={summary.daysLeave} />
          <StatCard label="Tardy (min)" value={summary.tardyMinutesTotal} tone={summary.tardyMinutesTotal > 0 ? 'amber' : 'neutral'} />
          <StatCard label="Undertime (min)" value={summary.undertimeMinutesTotal} tone={summary.undertimeMinutesTotal > 0 ? 'amber' : 'neutral'} />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:border-slate-400 print:shadow-none">
        <div className="border-b border-slate-200 px-6 py-4 text-center print:border-slate-400">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Civil Service Form No. 48
          </p>
          <h2 className="mt-1 text-base font-bold uppercase tracking-wide text-slate-900">
            Daily Time Record
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            For the month of {monthLabel}
          </p>
        </div>

        <div className="border-b border-slate-100 px-6 py-3 text-xs print:border-slate-300">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <span><strong className="text-slate-500">Name:</strong> {period.fullName}</span>
            <span><strong className="text-slate-500">Employee No:</strong> {period.employeeNumber}</span>
            <span><strong className="text-slate-500">Department:</strong> {period.departmentName ?? '—'}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 print:bg-white">
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-600 print:border-slate-400">
                <th className="px-3 py-2.5 font-semibold">Day</th>
                <th className="px-3 py-2.5 font-semibold">AM In</th>
                <th className="px-3 py-2.5 font-semibold">AM Out</th>
                <th className="px-3 py-2.5 font-semibold">PM In</th>
                <th className="px-3 py-2.5 font-semibold">PM Out</th>
                <th className="px-3 py-2.5 font-semibold">OT In</th>
                <th className="px-3 py-2.5 font-semibold">OT Out</th>
                <th className="px-3 py-2.5 text-right font-semibold">Hours</th>
                <th className="px-3 py-2.5 text-right font-semibold">Tardy</th>
                <th className="px-3 py-2.5 text-right font-semibold">UT</th>
                <th className="px-3 py-2.5 font-semibold">Remarks</th>
                {isEditable && <th className="px-3 py-2.5 print:hidden" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
              {logs.map((log) => {
                const date = parseDateOnly(log.logDate);
                const dow = date ? DOW[date.getDay()] : '';
                const dayNum = date ? String(date.getDate()).padStart(2, '0') : '';
                const isWeekend = date ? (date.getDay() === 0 || date.getDay() === 6) : false;
                const isEditing = editLogId === log.id;

                const rowClass = log.isHoliday
                  ? 'bg-rose-50/60'
                  : isWeekend
                  ? 'bg-slate-50/60'
                  : log.isAbsent
                  ? 'bg-red-50/40'
                  : log.isLeave
                  ? 'bg-amber-50/40'
                  : '';

                return (
                  <Fragment key={log.id}>
                    <tr className={`${rowClass} transition hover:bg-brand-50/30 ${isEditing ? 'ring-1 ring-inset ring-brand-300' : ''}`}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="font-mono text-slate-700">{dayNum}</span>
                        <span className="ml-2 text-slate-400">{dow}</span>
                        {log.isHoliday && (
                          <span className="ml-2 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-700">
                            {log.holidayName ?? 'Holiday'}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.amArrival)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.amDeparture)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.pmArrival)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.pmDeparture)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.overtimeIn)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(log.overtimeOut)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {Number(log.hoursWorked ?? 0).toFixed(2)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${
                        log.tardinessMinutes > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'
                      }`}>
                        {log.tardinessMinutes || '—'}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${
                        log.undertimeMinutes > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'
                      }`}>
                        {log.undertimeMinutes || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {log.remarks ?? '—'}
                        {log.isLeave && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {log.leaveType} leave
                          </span>
                        )}
                      </td>
                      {isEditable && (
                        <td className="whitespace-nowrap px-3 py-2 text-right print:hidden">
                          <button type="button"
                            onClick={() => (isEditing ? cancelEdit() : startEdit(log))}
                            aria-label={isEditing ? 'Close editor' : 'Edit'}
                            className={`rounded-lg p-1.5 transition ${
                              isEditing
                                ? 'bg-brand-600 text-white hover:bg-brand-700'
                                : 'text-slate-400 hover:bg-slate-100 hover:text-brand-700'
                            }`}>
                            {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      )}
                    </tr>

                    {isEditing && (
                      <tr className="print:hidden">
                        <td colSpan={isEditable ? 12 : 11} className="bg-brand-50/30 px-5 py-5">
                          <LogEditor
                            log={log}
                            buffer={editBuffer}
                            setBuffer={setEditBuffer}
                            onSave={saveLog}
                            onCancel={cancelEdit}
                            saving={savingLog}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-8 border-t border-slate-200 px-6 py-6 text-xs print:border-slate-400">
          <div>
            <p className="text-slate-500">Certified correct:</p>
            <div className="mt-8 border-t border-slate-400 pt-1 text-center">
              <p className="font-semibold text-slate-900">{period.fullName}</p>
              <p className="text-slate-500">Employee signature</p>
            </div>
          </div>
          <div>
            <p className="text-slate-500">Approved by:</p>
            <div className="mt-8 border-t border-slate-400 pt-1 text-center">
              <p className="font-semibold text-slate-900">&nbsp;</p>
              <p className="text-slate-500">Supervisor / Authorized Official</p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmTransition)}
        onClose={() => setConfirmTransition(null)}
        onConfirm={() => handleTransition(confirmTransition.to)}
        loading={transitioning}
        title={confirmTransition?.label ?? 'Confirm'}
        message={
          confirmTransition?.to === 'locked'
            ? 'Locking this period will prevent all edits. This cannot be undone from the UI.'
            : confirmTransition?.to === 'submitted'
            ? 'Submit this DTR for review? You can still edit it until it is verified.'
            : confirmTransition?.to === 'draft'
            ? 'Send this DTR back to draft for corrections?'
            : 'Confirm this action?'
        }
        confirmLabel={confirmTransition?.label ?? 'Confirm'}
        variant="primary"
      />
    </div>
  );
}

/* =====================================================================
 *  Full-width log editor panel
 * ===================================================================== */
function LogEditor({ log, buffer, setBuffer, onSave, onCancel, saving }) {
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setBuffer((b) => ({ ...b, [key]: value }));
  };
  const t = (key) => (buffer[key] ?? '').slice(0, 8);
  const date = parseDateOnly(log.logDate);
  const dateLabel = date
    ? `${DOW[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    : log.logDate;

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Editing · {dateLabel}
          </h3>
          <p className="text-xs text-slate-500">
            {log.isHoliday
              ? `Holiday: ${log.holidayName ?? 'yes'}`
              : `Source: ${log.source}`}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Time entries */}
        <div className="lg:col-span-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Time entries
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TimeField label="AM In"  value={t('amArrival')}   onChange={set('amArrival')} />
            <TimeField label="AM Out" value={t('amDeparture')} onChange={set('amDeparture')} />
            <TimeField label="PM In"  value={t('pmArrival')}   onChange={set('pmArrival')} />
            <TimeField label="PM Out" value={t('pmDeparture')} onChange={set('pmDeparture')} />
            <TimeField label="OT In"  value={t('overtimeIn')}  onChange={set('overtimeIn')} />
            <TimeField label="OT Out" value={t('overtimeOut')} onChange={set('overtimeOut')} />
          </div>
        </div>

        {/* Classification */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Classification
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!buffer.isAbsent} onChange={set('isAbsent')}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
              Absent
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!buffer.isLeave} onChange={set('isLeave')}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
              On leave
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!buffer.isLwop} onChange={set('isLwop')}
                className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500" />
              Leave without pay
            </label>
          </div>
        </div>

        {/* Leave details (only when on leave) */}
        {buffer.isLeave && (
          <div className="lg:col-span-2">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Leave details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600">Type</label>
                <input type="text" value={buffer.leaveType ?? ''} onChange={set('leaveType')}
                  placeholder="Sick / Vacation"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Hours</label>
                <input type="number" min="0" max="24" step="0.5" value={buffer.leaveHours ?? ''}
                  onChange={set('leaveHours')}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
              </div>
            </div>
          </div>
        )}

        {/* Metrics */}
        <div className="lg:col-span-2">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Computed metrics
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumField label="Hours"     value={buffer.hoursWorked}      onChange={set('hoursWorked')}      step="0.01" min="0" max="24" />
            <NumField label="Tardy (m)" value={buffer.tardinessMinutes} onChange={set('tardinessMinutes')} min="0" />
            <NumField label="UT (m)"    value={buffer.undertimeMinutes} onChange={set('undertimeMinutes')} min="0" />
            <NumField label="OT (m)"    value={buffer.overtimeMinutes}  onChange={set('overtimeMinutes')}  min="0" />
          </div>
        </div>

        {/* Remarks */}
        <div className="lg:col-span-4">
          <label className="block text-xs font-medium text-slate-600">Remarks</label>
          <input type="text" value={buffer.remarks ?? ''} onChange={set('remarks')}
            placeholder="Optional note — visible on the printed form"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
      </div>

      <footer className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
          <X className="h-4 w-4" />
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}

function TimeField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-600">{label}</label>
      <input type="time" step="1" value={value} onChange={onChange}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
    </div>
  );
}

function NumField({ label, value, onChange, ...rest }) {
  return (
    <div>
      <label className="block text-xs text-slate-600">{label}</label>
      <input type="number" value={value} onChange={onChange}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        {...rest} />
    </div>
  );
}

/* =====================================================================
 *  Stat card
 * ===================================================================== */
function StatCard({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-slate-900',
    emerald: 'text-emerald-700',
    red:     'text-red-700',
    amber:   'text-amber-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</p>
    </div>
  );
}