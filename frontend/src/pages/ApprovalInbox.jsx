import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2, RefreshCw, Inbox, CheckCircle2, XCircle,
  Clock, User, AlertCircle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
}

function fmtRange(start, end) {
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}

export default function ApprovalInbox() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canReview = hasPermission('leave.review');
  const canApprove = hasPermission('leave.approve');

  const [tab, setTab] = useState(canReview ? 'supervisor' : 'approver');
  const [data, setData] = useState({ supervisorQueue: [], approverQueue: [], counts: { supervisor: 0, approver: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [action, setAction] = useState(null);   // { kind: 'review'|'approve', app, decision: 'approve'|'reject' }
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/leaves/inbox');
      setData(data.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAction(kind, app, decision) {
    setAction({ kind, app, decision });
    setRemarks('');
    setActionError(null);
  }

  async function submitAction() {
    if (!action) return;
    setSubmitting(true); setActionError(null);
    try {
      const endpoint = action.kind === 'review'
        ? `/leaves/${action.app.id}/review`
        : `/leaves/${action.app.id}/approve`;
      const act = action.decision === 'approve' ? (action.kind === 'review' ? 'recommend' : 'approve') : 'reject';
      await api.post(endpoint, { action: act, remarks: remarks.trim() || null });
      setAction(null);
      await load();
    } catch (err) {
      setActionError(extractApiError(err).message);
    } finally { setSubmitting(false); }
  }

  const currentQueue = tab === 'supervisor' ? data.supervisorQueue : data.approverQueue;
  const tabs = [
    canReview   && { id: 'supervisor', label: 'Supervisor review', count: data.counts.supervisor },
    canApprove  && { id: 'approver',   label: 'Final approval',    count: data.counts.approver   },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Inbox className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Approval Inbox</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Leave applications awaiting your review or final approval.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {/* Tabs */}
      <nav className="mt-6 flex gap-1 border-b border-slate-200" aria-label="Inbox sections">
        {tabs.map(({ id, label, count }) => (
          <button key={id} type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}>
            {label}
            {count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                tab === id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : currentQueue.length === 0 ? (
          <EmptyState Icon={CheckCircle2}
            title="Inbox is clear"
            description="No leave applications are awaiting your action right now."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {currentQueue.map((app) => (
                <li key={app.id} className="p-5 transition hover:bg-slate-50/60">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Left: identity + dates */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/leaves/${app.id}`}
                          className="font-mono text-xs font-medium text-brand-700 hover:underline">
                          {app.applicationNumber}
                        </Link>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Filed {daysAgo(app.filedAt)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {app.employeeName.split(',')[0].slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{app.employeeName}</p>
                          <p className="text-xs text-slate-500">
                            {app.employeeNumber} · {app.departmentName ?? '—'}
                            {app.positionTitle && <> · {app.positionTitle}</>}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: app.leaveTypeColor }} />
                          <strong className="font-semibold text-slate-800">{app.leaveTypeName}</strong>
                        </span>
                        <span>{fmtRange(app.startDate, app.endDate)}</span>
                        <span className="font-mono text-slate-700">
                          {app.totalDays} day{app.totalDays !== 1 ? 's' : ''}
                        </span>
                        {app.startHalf && <span className="rounded bg-slate-100 px-1.5 py-0.5">{app.startHalf} only</span>}
                        {app.endHalf && <span className="rounded bg-slate-100 px-1.5 py-0.5">{app.endHalf} only</span>}
                        {app.leaveTypeRequiresAttachment && app.attachmentPath && (
                          <span className="text-brand-700">📎 attachment on file</span>
                        )}
                      </div>

                      {app.reason && (
                        <p className="mt-2 line-clamp-2 text-xs italic text-slate-500">"{app.reason}"</p>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <Link to={`/leaves/${app.id}`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Details
                      </Link>
                      {tab === 'supervisor' && canReview && (
                        <>
                          <button type="button"
                            onClick={() => openAction('review', app, 'reject')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button type="button"
                            onClick={() => openAction('review', app, 'approve')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Recommend
                          </button>
                        </>
                      )}
                      {tab === 'approver' && canApprove && (
                        <>
                          <button type="button"
                            onClick={() => openAction('approve', app, 'reject')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button type="button"
                            onClick={() => openAction('approve', app, 'approve')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action confirm dialog */}
      <Modal
        open={Boolean(action)}
        onClose={submitting ? () => {} : () => setAction(null)}
        title={
          action?.decision === 'approve'
            ? (action?.kind === 'review' ? 'Recommend this application?' : 'Approve this application?')
            : (action?.kind === 'review' ? 'Reject this application?' : 'Reject this application?')
        }
        size="md"
        closeOnBackdrop={!submitting}
        footer={
          <>
            <button type="button" onClick={() => setAction(null)} disabled={submitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={submitAction} disabled={submitting}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${
                action?.decision === 'approve'
                  ? (action?.kind === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700')
                  : 'bg-red-600 hover:bg-red-700'
              }`}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Processing…' : 'Confirm'}
            </button>
          </>
        }
      >
        {actionError && <div className="mb-4"><Alert variant="error">{actionError}</Alert></div>}

        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">Application</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{action?.app.applicationNumber}</p>
          <p className="mt-2 text-sm text-slate-700">
            <strong>{action?.app.employeeName}</strong> — {action?.app.leaveTypeName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {fmtRange(action?.app.startDate, action?.app.endDate)} · {action?.app.totalDays} day(s)
          </p>
        </div>

        {action?.decision === 'approve' && action?.kind === 'approve' && (
          <div className="mt-4">
            <Alert variant="info">
              Approving this application will deduct <strong>{action?.app.totalDays} day(s)</strong> from
              the employee's {action?.app.leaveTypeName} balance immediately.
            </Alert>
          </div>
        )}

        <label htmlFor="remarks" className="mt-4 block text-sm font-medium text-slate-700">
          Remarks {action?.decision === 'reject' && <span className="text-red-500">(recommended)</span>}
        </label>
        <textarea id="remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
          placeholder={action?.decision === 'reject'
            ? 'Explain why this application is being rejected.'
            : 'Optional note for the employee.'}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </Modal>
    </div>
  );
}