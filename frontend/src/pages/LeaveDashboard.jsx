import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, RefreshCw, Wallet, TrendingUp, Users, ArrowRight,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';

export default function LeaveDashboard() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/leave-credits/summary');
      setSummary(data.data.summary);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Wallet className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Leave Dashboard</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Agency-wide leave balance overview across all credited leave types.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/leaves/inbox"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Approval inbox
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        </div>
      ) : summary.length === 0 ? (
        <p className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          No credited leave types with balances yet. Seed employees first.
        </p>
      ) : (
        <>
          {/* Type summary cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div key={s.code}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/50 px-5 py-3"
                  style={{ borderLeft: `4px solid ${s.colorHex}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {s.code}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3 w-3" />
                      {s.employeeCount}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{s.name}</p>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Total balance</p>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
                        {s.totalBalance.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Avg per employee</p>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-700">
                        {s.avgBalance.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>Min: <strong className="font-mono text-slate-700">{s.minBalance.toFixed(2)}</strong></span>
                    <span>Max: <strong className="font-mono text-slate-700">{s.maxBalance.toFixed(2)}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <QuickLink
              to="/leaves/inbox"
              Icon={TrendingUp}
              title="Approval inbox"
              description="Review and approve pending leave applications."
            />
            <QuickLink
              to="/leave-credits/ledger"
              Icon={Wallet}
              title="Credit ledger"
              description="View per-employee balances and transaction history."
            />
            <QuickLink
              to="/leave-types"
              Icon={Users}
              title="Leave types"
              description="Manage leave catalogue, accrual rules, and eligibility."
            />
          </div>
        </>
      )}
    </div>
  );
}

function QuickLink({ to, Icon, title, description }) {
  return (
    <Link to={to}
      className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
    </Link>
  );
}