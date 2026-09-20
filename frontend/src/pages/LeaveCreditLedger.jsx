import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, RefreshCw, Wallet, Plus, Search, Play, TrendingUp,
  ArrowDown, ArrowUp, Settings2,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';

const TXN_STYLES = {
  opening_balance:  'bg-slate-100 text-slate-700',
  accrual:          'bg-emerald-100 text-emerald-800',
  deduction:        'bg-red-100 text-red-800',
  adjustment_add:   'bg-brand-100 text-brand-800',
  adjustment_deduct:'bg-amber-100 text-amber-800',
  expiry:           'bg-slate-200 text-slate-700',
  conversion:       'bg-violet-100 text-violet-800',
  encashment:       'bg-pink-100 text-pink-800',
};

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${y}`;
}

export default function LeaveCreditLedger() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();

  const canAdjust = hasPermission('leave_credits.adjust');
  const canAccrue = hasPermission('leave_credits.post_monthly');

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(searchParams.get('employeeId') || '');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [balances, setBalances] = useState([]);
  const [employeeMeta, setEmployeeMeta] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ leaveTypeId: '', amount: '', reason: '' });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState(null);

  const [accrualOpen, setAccrualOpen] = useState(false);
  const [accrualForm, setAccrualForm] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth() + 1, kind: 'monthly',
  });
  const [accruing, setAccruing] = useState(false);
  const [accrualResult, setAccrualResult] = useState(null);
  const [accrualError, setAccrualError] = useState(null);

  // Load employee list for the picker
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/employees?limit=500&activeOnly=true');
        setEmployees(data.data.employees ?? []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const loadLedger = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
      });
      if (leaveTypeFilter) params.set('leaveTypeId', leaveTypeFilter);

      const [balRes, ledgerRes] = await Promise.all([
        api.get(`/leave-credits/employee/${employeeId}`),
        api.get(`/leave-credits/employee/${employeeId}/ledger?${params.toString()}`),
      ]);
      setBalances(balRes.data.data.balances);
      setEmployeeMeta(balRes.data.data.employee);
      setLedger(ledgerRes.data.data.ledger);
      setPagination((p) => ({ ...p, total: ledgerRes.data.data.pagination.total }));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, [employeeId, pagination.page, pagination.limit, leaveTypeFilter]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  // Reset to page 1 when employee or filter changes
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [employeeId, leaveTypeFilter]);

  function openAdjust() {
    if (!balances.length) {
      setError('This employee has no credited leave balances to adjust.');
      return;
    }
    setAdjustForm({
      leaveTypeId: balances[0].leaveTypeId,
      amount: '',
      reason: '',
    });
    setAdjustError(null);
    setAdjustOpen(true);
  }

  async function submitAdjust() {
    setAdjustError(null);
    const amount = Number(adjustForm.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      setAdjustError('Amount must be a non-zero number.');
      return;
    }
    if (adjustForm.reason.trim().length < 5) {
      setAdjustError('Reason must be at least 5 characters.');
      return;
    }

    setAdjusting(true);
    try {
      await api.post('/leave-credits/adjust', {
        employeeId: Number(employeeId),
        leaveTypeId: Number(adjustForm.leaveTypeId),
        amount,
        reason: adjustForm.reason.trim(),
      });
      setAdjustOpen(false);
      await loadLedger();
    } catch (err) {
      setAdjustError(extractApiError(err).message);
    } finally { setAdjusting(false); }
  }

  async function submitAccrual() {
    setAccruing(true); setAccrualError(null); setAccrualResult(null);
    try {
      const endpoint = accrualForm.kind === 'monthly'
        ? '/leave-credits/accrue/monthly'
        : '/leave-credits/accrue/annual';

      const payload = accrualForm.kind === 'monthly'
        ? { year: Number(accrualForm.year), month: Number(accrualForm.month) }
        : { year: Number(accrualForm.year) };

      const { data } = await api.post(endpoint, payload);
      setAccrualResult(data.data.accrual);
      if (employeeId) await loadLedger();
    } catch (err) {
      setAccrualError(extractApiError(err).message);
    } finally { setAccruing(false); }
  }

  const filteredEmployees = employees.filter((e) =>
    !employeeSearch ||
    e.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    e.employeeNumber.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Wallet className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Leave Credit Ledger</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            View balances and transaction history; run accruals; issue manual adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAccrue && (
            <button type="button" onClick={() => { setAccrualOpen(true); setAccrualResult(null); setAccrualError(null); }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Play className="h-4 w-4" />
              Run accrual
            </button>
          )}
          {canAdjust && employeeId && (
            <button type="button" onClick={openAdjust}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              Adjust balance
            </button>
          )}
        </div>
      </header>

      {/* Employee picker */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search employee…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:max-w-md">
          <option value="">— Select an employee —</option>
          {filteredEmployees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>
          ))}
        </select>
        {employeeId && (
          <button type="button" onClick={loadLedger} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {!employeeId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <Wallet className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Select an employee</p>
          <p className="mt-1 text-xs text-slate-500">Choose an employee above to view their ledger.</p>
        </div>
      )}

      {employeeId && (
        <>
          {employeeMeta && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Employee</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{employeeMeta.fullName}</p>
              <p className="font-mono text-xs text-slate-500">{employeeMeta.employeeNumber}</p>
            </div>
          )}

          {/* Balance cards */}
          {balances.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {balances.map((b) => (
                <div key={b.leaveTypeId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.colorHex }} />
                    <p className="text-xs font-semibold text-slate-700">{b.code}</p>
                  </div>
                  <p className={`mt-2 text-3xl font-bold tracking-tight ${
                    b.balance < 0 ? 'text-red-700' : b.balance > 0 ? 'text-slate-900' : 'text-slate-400'
                  }`}>
                    {b.balance.toFixed(3)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{b.name}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-emerald-600" />
                      {b.earnedYtd.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ArrowDown className="h-3 w-3 text-red-600" />
                      {b.usedYtd.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ledger table */}
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Transaction history
              </h2>
              <select value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-500">
                <option value="">All types</option>
                {balances.map((b) => (
                  <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.code}</option>
                ))}
              </select>
            </header>

            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : ledger.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">No transactions.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-white">
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-2 text-left font-semibold">Date</th>
                        <th className="px-3 py-2 text-left font-semibold">Type</th>
                        <th className="px-3 py-2 text-left font-semibold">Txn</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        <th className="px-3 py-2 text-right font-semibold">Balance</th>
                        <th className="px-5 py-2 text-left font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-slate-600">
                            {fmtDate(r.effectiveDate)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-xs font-medium text-slate-800">
                              {r.leaveTypeCode}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${TXN_STYLES[r.transactionType] ?? 'bg-slate-100 text-slate-700'}`}>
                              {r.transactionType.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium ${
                            r.amount > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            {r.amount > 0 ? '+' : ''}{r.amount.toFixed(3)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-slate-700">
                            {r.runningBalance.toFixed(3)}
                          </td>
                          <td className="max-w-md px-5 py-2.5 text-xs text-slate-600">
                            {r.remarks ?? '—'}
                            {r.createdByUsername && (
                              <span className="ml-1 text-slate-400">· {r.createdByUsername}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pagination.total > 0 && (
                  <Pagination
                    page={pagination.page} limit={pagination.limit} total={pagination.total}
                    onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
                    onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Adjustment modal */}
      <Modal
        open={adjustOpen}
        onClose={adjusting ? () => {} : () => setAdjustOpen(false)}
        title="Manual credit adjustment"
        size="md"
        closeOnBackdrop={!adjusting}
        footer={
          <>
            <button type="button" onClick={() => setAdjustOpen(false)} disabled={adjusting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={submitAdjust} disabled={adjusting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              {adjusting ? 'Applying…' : 'Apply adjustment'}
            </button>
          </>
        }
      >
        {adjustError && <div className="mb-4"><Alert variant="error">{adjustError}</Alert></div>}

        <div className="space-y-4">
          <div>
            <label htmlFor="at" className="block text-sm font-medium text-slate-700">Leave type</label>
            <select id="at" value={adjustForm.leaveTypeId}
              onChange={(e) => setAdjustForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              {balances.map((b) => (
                <option key={b.leaveTypeId} value={b.leaveTypeId}>
                  {b.name} ({b.code}) — current {b.balance.toFixed(3)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="amt" className="block text-sm font-medium text-slate-700">
              Amount (days) <span className="text-red-500">*</span>
            </label>
            <input id="amt" type="number" step="0.25" value={adjustForm.amount}
              onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="Positive to credit, negative to deduct"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <p className="mt-1 text-[11px] text-slate-500">
              Example: <code className="font-mono">2.5</code> credits 2.5 days; <code className="font-mono">-1.0</code> deducts 1 day.
            </p>
          </div>

          <div>
            <label htmlFor="rs" className="block text-sm font-medium text-slate-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea id="rs" rows={3} value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Conversion of unused SL to VL per HR memo dated…"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>
        </div>
      </Modal>

      {/* Accrual modal */}
      <Modal
        open={accrualOpen}
        onClose={accruing ? () => {} : () => { setAccrualOpen(false); setAccrualResult(null); setAccrualError(null); }}
        title="Run credit accrual"
        description="Idempotent — safe to re-run for the same period."
        size="lg"
        closeOnBackdrop={!accruing}
        footer={
          <>
            <button type="button" onClick={() => { setAccrualOpen(false); setAccrualResult(null); }}
              disabled={accruing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Close
            </button>
            <button type="button" onClick={submitAccrual} disabled={accruing}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {accruing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              {accruing ? 'Posting…' : 'Run accrual'}
            </button>
          </>
        }
      >
        {accrualError && <div className="mb-4"><Alert variant="error">{accrualError}</Alert></div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="ak" className="block text-sm font-medium text-slate-700">Kind</label>
            <select id="ak" value={accrualForm.kind}
              onChange={(e) => setAccrualForm((f) => ({ ...f, kind: e.target.value }))}
              disabled={accruing}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:bg-slate-50">
              <option value="monthly">Monthly (VL / SL)</option>
              <option value="annual">Annual (SPL / Solo)</option>
            </select>
          </div>
          <div>
            <label htmlFor="ay" className="block text-sm font-medium text-slate-700">Year</label>
            <input id="ay" type="number" value={accrualForm.year}
              onChange={(e) => setAccrualForm((f) => ({ ...f, year: e.target.value }))}
              disabled={accruing}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:bg-slate-50" />
          </div>
          {accrualForm.kind === 'monthly' && (
            <div>
              <label htmlFor="am" className="block text-sm font-medium text-slate-700">Month</label>
              <select id="am" value={accrualForm.month}
                onChange={(e) => setAccrualForm((f) => ({ ...f, month: e.target.value }))}
                disabled={accruing}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:bg-slate-50">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {['January','February','March','April','May','June',
                      'July','August','September','October','November','December'][i]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {accrualResult && (
          <div className="mt-5 space-y-3">
            <Alert variant="success" title={`Accrual posted for ${accrualResult.effectiveDate}`}>
              Results per leave type:
            </Alert>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Accrued</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Skipped (dup)</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Skipped (cap)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accrualResult.results.map((r) => (
                    <tr key={r.leaveTypeId}>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.code} — {r.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{r.amountPerEmployee}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">{r.employeesAccrued}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{r.skippedDuplicate}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-700">{r.skippedCapped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}