import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Calendar, FileText, CheckCircle2, XCircle,
  Clock, MessageSquare, User, Paperclip, AlertCircle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';

const STATUS_STYLES = {
  pending_supervisor: 'bg-amber-50 text-amber-800 ring-amber-200',
  pending_approver:   'bg-brand-50 text-brand-800 ring-brand-200',
  approved:           'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected:           'bg-red-50 text-red-800 ring-red-200',
  cancelled:          'bg-slate-100 text-slate-600 ring-slate-200',
};

const STATUS_LABEL = {
  pending_supervisor: 'Awaiting supervisor review',
  pending_approver:   'Awaiting final approval',
  approved:           'Approved',
  rejected:           'Rejected',
  cancelled:          'Cancelled',
};

const ACTION_LABEL = {
  filed:            'Filed',
  recommended:      'Recommended by supervisor',
  approved:         'Approved',
  rejected:         'Rejected',
  returned:         'Returned to previous stage',
  cancelled:        'Cancelled',
  reopened:         'Reopened',
  credit_committed: 'Credits committed',
  credit_reversed:  'Credits reversed',
};

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${y}`;
}

export default function LeaveApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get(`/leaves/${id}`);
      setData(data.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true); setCancelError(null);
    try {
      await api.post(`/leaves/${id}/cancel`, { reason: cancelReason.trim() });
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch (err) {
      setCancelError(extractApiError(err).message);
    } finally { setCancelling(false); }
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
        <Alert variant="error" title="Could not load application">{error}</Alert>
        <Link to="/leaves/my" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
    );
  }

  const { application: a, actions, days } = data;
  const canCancel = ['pending_supervisor', 'pending_approver'].includes(a.status);
  const canReview = hasPermission('leave.review') && a.status === 'pending_supervisor';
  const canApprove = hasPermission('leave.approve') && a.status === 'pending_approver';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link to="/leaves/my" className="hover:text-brand-600">My Leaves</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-mono">{a.applicationNumber}</span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {a.leaveTypeName} Application
            </h1>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[a.status]}`}>
              {STATUS_LABEL[a.status]}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">{a.applicationNumber}</p>
          <p className="mt-2 text-sm text-slate-600">
            Filed {fmtDateTime(a.filedAt)}
            {a.filedByUsername && a.filedByUsername !== a.employeeName && (
              <> by <strong>{a.filedByUsername}</strong></>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/leaves/my"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          {canCancel && (
            <button type="button" onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              <XCircle className="h-4 w-4" />
              Cancel
            </button>
          )}
          {(canReview || canApprove) && (
            <Link to="/leaves/inbox"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <CheckCircle2 className="h-4 w-4" />
              Act in Inbox
            </Link>
          )}
        </div>
      </header>

      {/* Summary card */}
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <Calendar className="h-4 w-4 text-slate-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Application details
          </h2>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Employee" value={a.employeeName} sub={a.employeeNumber} />
          <Row label="Department" value={a.departmentName ?? '—'} sub={a.departmentCode} />
          <Row label="Position" value={a.positionTitle ?? '—'} />
          <Row label="Leave type" value={a.leaveTypeName} sub={a.leaveTypeCode} />
          <Row label="Start date" value={fmtDate(a.startDate)} sub={a.startHalf ? `${a.startHalf} only` : null} />
          <Row label="End date" value={fmtDate(a.endDate)} sub={a.endHalf ? `${a.endHalf} only` : null} />
          <Row label="Total days" value={Number(a.totalDays).toFixed(2)} />
          <Row label="With pay" value={a.isWithPay ? 'Yes' : 'No'} />
          <Row label="Contact phone" value={a.contactPhone ?? '—'} />
        </dl>

        {a.reason && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Reason</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{a.reason}</p>
          </div>
        )}

        {a.attachmentPath && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Attachment</p>
            <a href={a.attachmentPath} target="_blank" rel="noreferrer"
              className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
              <Paperclip className="h-3.5 w-3.5" />
              {a.attachmentPath.split('/').pop()}
            </a>
          </div>
        )}
      </section>

      {/* Day-by-day breakdown */}
      {days && days.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <Clock className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Day breakdown
            </h2>
          </header>
          <div className="flex flex-wrap gap-1.5 px-5 py-4">
            {days.map((d) => (
              <span key={d.date}
                title={d.isHoliday ? 'Holiday' : d.isWeekend ? 'Weekend' : 'Working day'}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono ${
                  d.isHoliday
                    ? 'bg-rose-100 text-rose-700'
                    : d.isWeekend
                    ? 'bg-slate-100 text-slate-400'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                {d.date.slice(5)}
              </span>
            ))}
          </div>
          <p className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
            Green = charged to leave credits · Grey = weekend (skipped) · Red = holiday (skipped)
          </p>
        </section>
      )}

      {/* Audit trail */}
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Activity log
          </h2>
        </header>
        <ul className="divide-y divide-slate-100">
          {actions.map((act) => (
            <li key={act.id} className="flex gap-3 px-5 py-4">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                act.action === 'approved' || act.action === 'recommended' || act.action === 'credit_committed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : act.action === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : act.action === 'cancelled'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-brand-100 text-brand-700'
              }`}>
                {act.action === 'rejected' || act.action === 'cancelled'
                  ? <XCircle className="h-3.5 w-3.5" />
                  : act.action === 'approved' || act.action === 'recommended'
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <User className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-medium text-slate-900">
                    {ACTION_LABEL[act.action] ?? act.action}
                  </p>
                  {act.actorUsername && (
                    <p className="text-xs text-slate-500">
                      by <strong className="text-slate-700">{act.actorFullName ?? act.actorUsername}</strong>
                      {act.actorRoleCode && <> ({act.actorRoleCode})</>}
                    </p>
                  )}
                </div>
                {act.remarks && (
                  <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{act.remarks}</p>
                )}
                <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(act.actedAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Credit summary if approved */}
      {a.status === 'approved' && a.creditCommitted && (
        <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Credits committed</p>
              <p className="mt-1 text-xs text-emerald-800">
                {Number(a.creditDaysDeducted).toFixed(2)} day(s) deducted on {fmtDateTime(a.creditCommittedAt)}.
              </p>
            </div>
          </div>
        </section>
      )}

      {a.status === 'cancelled' && a.cancelledReason && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Cancellation</p>
              <p className="mt-1 text-xs text-slate-600">{a.cancelledReason}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(a.cancelledAt)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Cancel dialog */}
      <Modal
        open={cancelOpen}
        onClose={cancelling ? () => {} : () => setCancelOpen(false)}
        title="Cancel application?"
        size="md"
        closeOnBackdrop={!cancelling}
        footer={
          <>
            <button type="button" onClick={() => setCancelOpen(false)} disabled={cancelling}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Keep
            </button>
            <button type="button" onClick={handleCancel}
              disabled={cancelling || cancelReason.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {cancelling ? 'Cancelling…' : 'Cancel application'}
            </button>
          </>
        }
      >
        {cancelError && <div className="mb-4"><Alert variant="error">{cancelError}</Alert></div>}
        <label htmlFor="cr" className="block text-sm font-medium text-slate-700">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea id="cr" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </Modal>
    </div>
  );
}

function Row({ label, value, sub }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">
        {value}
        {sub && <span className="ml-1.5 text-xs text-slate-500">({sub})</span>}
      </dd>
    </div>
  );
}