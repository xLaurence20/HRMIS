import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Loader2, RefreshCw, Calendar, Clock, FileText,
  Eye, X, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/ui/Pagination';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';

const STATUS_STYLES = {
  draft:              'bg-slate-100 text-slate-700 ring-slate-200',
  pending_supervisor: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_approver:   'bg-brand-50 text-brand-700 ring-brand-200',
  approved:           'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected:           'bg-red-50 text-red-700 ring-red-200',
  cancelled:          'bg-slate-100 text-slate-500 ring-slate-200',
};

const STATUS_LABEL = {
  draft:              'Draft',
  pending_supervisor: 'Awaiting supervisor',
  pending_approver:   'Awaiting approval',
  approved:           'Approved',
  rejected:           'Rejected',
  cancelled:          'Cancelled',
};

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${y}`;
}

export default function MyLeaves() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [noEmployeeLink, setNoEmployeeLink] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const canFile = hasPermission('leave.apply');

  const load = useCallback(async () => {
    setLoading(true); setError(null); setNoEmployeeLink(false);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
      });
      if (status) params.set('status', status);

      const { data } = await api.get(`/leaves/my?${params.toString()}`);
      setApplications(data.data.applications);
      setPagination((p) => ({ ...p, total: data.data.pagination.total }));
    } catch (err) {
      const e = extractApiError(err);
      if (e.code === 'NO_EMPLOYEE_LINK') setNoEmployeeLink(true);
      else setError(e.message);
    } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [status]);

  async function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCancelling(true); setCancelError(null);
    try {
      await api.post(`/leaves/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() });
      setCancelTarget(null);
      setCancelReason('');
      load();
    } catch (err) {
      setCancelError(extractApiError(err).message);
    } finally { setCancelling(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Calendar className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">My Leaves</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Track the status of your leave applications and file new ones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canFile && (
            <Link to="/leaves/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              File leave
            </Link>
          )}
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {noEmployeeLink && (
        <div className="mt-6">
          <Alert variant="info" title="No employee record linked">
            Your user account is not yet linked to an employee record, so you cannot file leave.
            Ask HR to link your account under Employees → your profile.
          </Alert>
        </div>
      )}

      {!noEmployeeLink && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              <option value="">All statuses</option>
              <option value="pending_supervisor">Awaiting supervisor</option>
              <option value="pending_approver">Awaiting approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : applications.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No applications yet</p>
                <p className="mt-1 text-xs text-slate-500">File your first leave request to see it here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Application','Leave type','Dates','Days','Status','Filed',''].map((h) => (
                        <th key={h} scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applications.map((a) => {
                      const canCancel = ['pending_supervisor','pending_approver'].includes(a.status);
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <Link to={`/leaves/${a.id}`}
                              className="font-mono text-xs font-medium text-brand-700 hover:underline">
                              {a.applicationNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.leaveTypeColor }} />
                              <span className="font-medium text-slate-900">{a.leaveTypeName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {fmtDate(a.startDate)}
                            {a.startDate !== a.endDate && <> → {fmtDate(a.endDate)}</>}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">{a.totalDays}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[a.status]}`}>
                              {STATUS_LABEL[a.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {fmtDate(a.filedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Link to={`/leaves/${a.id}`}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50">
                                <Eye className="h-3 w-3" />
                                View
                              </Link>
                              {canCancel && (
                                <button type="button" onClick={() => setCancelTarget(a)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50">
                                  <X className="h-3 w-3" />
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && applications.length > 0 && (
              <Pagination
                page={pagination.page} limit={pagination.limit} total={pagination.total}
                onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
                onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
              />
            )}
          </div>
        </>
      )}

      {/* Cancel dialog */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={cancelling ? () => {} : () => { setCancelTarget(null); setCancelReason(''); }}
        title="Cancel leave application?"
        size="md"
        closeOnBackdrop={!cancelling}
        footer={
          <>
            <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(''); }} disabled={cancelling}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Keep it
            </button>
            <button type="button" onClick={handleCancel}
              disabled={cancelling || cancelReason.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </>
        }
      >
        {cancelError && <div className="mb-4"><Alert variant="error">{cancelError}</Alert></div>}
        <p className="text-sm text-slate-600">
          Cancelling <strong>{cancelTarget?.applicationNumber}</strong> ({cancelTarget?.leaveTypeName},
          {' '}{cancelTarget?.totalDays} day{cancelTarget?.totalDays !== 1 ? 's' : ''}). This cannot be undone.
        </p>
        <label htmlFor="cancelReason" className="mt-4 block text-sm font-medium text-slate-700">
          Reason for cancellation <span className="text-red-500">*</span>
        </label>
        <textarea id="cancelReason" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g. Plans changed"
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </Modal>
    </div>
  );
}