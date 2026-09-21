import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Loader2, RefreshCw, AlertTriangle, Users,
  Activity, TrendingUp, FileWarning,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';

const DAY_OPTIONS = [7, 14, 30, 90, 180, 365];

export default function AuditDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/audit-logs/stats?days=${days}`);
      setData(data.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxDailyCount = data?.dailyTrend?.reduce((max, d) => Math.max(max, d.count), 1) ?? 1;
  const maxActionCount = data?.byAction?.reduce((max, a) => Math.max(max, a.count), 1) ?? 1;
  const maxEntityCount = data?.byEntity?.reduce((max, e) => Math.max(max, e.count), 1) ?? 1;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Audit Dashboard</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Activity overview, top actors, and action breakdown for the last {days} days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>Last {n} days</option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {loading || !data ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Top-line stat cards */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              Icon={Activity}
              label="Total events"
              value={data.totals.total}
              tone="neutral"
            />
            <StatCard
              Icon={Users}
              label="Distinct actors"
              value={data.totals.distinctActors}
              tone="brand"
            />
            <StatCard
              Icon={AlertTriangle}
              label="Warnings"
              value={data.totals.warning}
              tone={data.totals.warning > 0 ? 'amber' : 'neutral'}
            />
            <StatCard
              Icon={FileWarning}
              label="Critical"
              value={data.totals.critical}
              tone={data.totals.critical > 0 ? 'red' : 'neutral'}
            />
          </div>

          {/* Daily trend bar chart */}
          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Daily activity
              </h2>
            </header>
            <div className="px-5 py-5">
              {data.dailyTrend.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No activity in this period.
                </p>
              ) : (
                <div className="flex h-32 items-end gap-1">
                  {data.dailyTrend.map((d) => {
                    const h = Math.max(4, Math.round((d.count / maxDailyCount) * 100));
                    return (
                      <div
                        key={d.day}
                        className="group relative flex-1"
                        title={`${d.day}: ${d.count} event${d.count !== 1 ? 's' : ''}`}
                      >
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-brand-500 to-brand-400 transition hover:from-brand-600 hover:to-brand-500"
                          style={{ height: `${h}%`, minHeight: '4px' }}
                        />
                        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                          {d.day} · {d.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Three-column lower section */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Top actions */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Top actions
                </h2>
              </header>
              <div className="px-5 py-4">
                {data.byAction.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No data.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.byAction.map((a) => (
                      <li key={a.action}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{a.action}</span>
                          <span className="font-mono text-slate-500">{a.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                            style={{ width: `${(a.count / maxActionCount) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Top entities */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Entities touched
                </h2>
              </header>
              <div className="px-5 py-4">
                {data.byEntity.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No data.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.byEntity.map((e) => (
                      <li key={e.entityType}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-700">{e.entityType}</span>
                          <span className="font-mono text-slate-500">{e.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600"
                            style={{ width: `${(e.count / maxEntityCount) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Top actors */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Most active users
                </h2>
              </header>
              <div className="px-5 py-4">
                {data.topActors.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No data.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.topActors.map((a) => (
                      <li key={a.userId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
                          {(a.username ?? '?')[0].toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-800">
                            {a.username}
                          </p>
                          {a.roleCode && (
                            <p className="text-[10px] text-slate-500">{a.roleCode}</p>
                          )}
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-600">
                          {a.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ Icon, label, value, tone = 'neutral' }) {
  const tones = {
    neutral: { ring: 'ring-slate-200', text: 'text-slate-900', icon: 'bg-slate-100 text-slate-500' },
    brand:   { ring: 'ring-brand-200', text: 'text-brand-700', icon: 'bg-brand-100 text-brand-700' },
    amber:   { ring: 'ring-amber-200', text: 'text-amber-700', icon: 'bg-amber-100 text-amber-700' },
    red:     { ring: 'ring-red-200',   text: 'text-red-700',   icon: 'bg-red-100 text-red-700' },
  }[tone];

  return (
    <div className={`rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-inset ${tones.ring}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-3xl font-bold tracking-tight ${tones.text}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones.icon}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
    </div>
  );
}