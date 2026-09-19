import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Users, Clock, CalendarX, TrendingDown,
  RefreshCw, Loader2, Building2, ArrowRight, Award,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function AttendanceDashboard() {
  const { hasPermission } = useAuth();
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);

  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [recomputing, setRecomputing] = useState(false);
  const canRecompute = hasPermission('dtr.verify', 'attendance.monitor');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/departments');
        setDepartments(data.data.data?.departments ?? data.data.departments ?? []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year, month });
      if (departmentId) params.set('departmentId', departmentId);

      const [dashRes, alertRes] = await Promise.all([
        api.get(`/attendance/dashboard?${params.toString()}`),
        api.get(`/attendance/alerts?${params.toString()}`),
      ]);
      setDashboard(dashRes.data.data);
      setAlerts(alertRes.data.data.alerts);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [year, month, departmentId]);

  useEffect(() => { load(); }, [load]);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      await api.post('/attendance/summaries/recompute', {
        year: Number(year), month: Number(month),
      });
      await load();
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setRecomputing(false);
    }
  }

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const monthLabel = `${MONTHS[Number(month) - 1]} ${year}`;

  const totals = dashboard?.totals ?? {};
  const trendMax = Math.max(
    1,
    ...(dashboard?.trend ?? []).map((t) => t.tardyMinutes)
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <TrendingDown className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Attendance Dashboard
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Tardiness, undertime, and absence monitoring — {monthLabel}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canRecompute && (
            <button type="button" onClick={handleRecompute} disabled={recomputing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
              {recomputing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recompute
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <BigStat Icon={Users} label="Employees tracked" value={totals.employeeCount ?? 0} />
            <BigStat Icon={Clock} label="Total tardy (min)" value={totals.tardyMinutes ?? 0}
              tone={(totals.tardyMinutes ?? 0) > 0 ? 'amber' : 'neutral'} />
            <BigStat Icon={CalendarX} label="Absence days" value={totals.absenceDays ?? 0}
              tone={(totals.absenceDays ?? 0) > 0 ? 'red' : 'neutral'} />
            <BigStat Icon={Award} label="Hours worked" value={Number(totals.hoursWorked ?? 0).toFixed(1)}
              tone="emerald" />
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 shadow-sm">
              <header className="flex items-center gap-2 border-b border-amber-200 px-5 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-900">
                  {alerts.length} employee{alerts.length > 1 ? 's' : ''} exceeding thresholds
                </h2>
              </header>
              <ul className="divide-y divide-amber-100">
                {alerts.map((a) => (
                  <li key={a.employeeId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-medium text-slate-900">{a.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {a.employeeNumber} · {a.departmentName ?? '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {a.reasons.map((r) => (
                        <span key={r.type}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300">
                          {r.type}: {r.value} / {r.threshold}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Two-column grid */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* By department */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <Building2 className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  By department
                </h2>
              </header>
              {dashboard?.byDepartment?.length ? (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2 text-left">Department</th>
                      <th className="px-3 py-2 text-right">Emp</th>
                      <th className="px-3 py-2 text-right">Tardy</th>
                      <th className="px-5 py-2 text-right">Absences</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.byDepartment.map((d) => (
                      <tr key={d.id ?? 'none'}>
                        <td className="px-5 py-2.5 text-slate-700">{d.name ?? '(unassigned)'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{d.employees}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${
                          d.tardyMinutes > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'
                        }`}>{d.tardyMinutes}</td>
                        <td className={`px-5 py-2.5 text-right font-mono ${
                          d.absenceDays > 0 ? 'font-semibold text-red-700' : 'text-slate-400'
                        }`}>{d.absenceDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-5 py-6 text-center text-xs text-slate-500">
                  No data for this period.
                </p>
              )}
            </section>

            {/* Monthly trend */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <TrendingDown className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Recent trend (tardy minutes)
                </h2>
              </header>
              <div className="px-5 py-4">
                {dashboard?.trend?.length ? (
                  <div className="space-y-2">
                    {dashboard.trend.map((t) => (
                      <div key={t.label} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 font-mono text-xs text-slate-500">
                          {t.label}
                        </span>
                        <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
                            style={{ width: `${(t.tardyMinutes / trendMax) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-600">
                          {t.tardyMinutes}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-slate-500">No history yet.</p>
                )}
              </div>
            </section>
          </div>

          {/* Top tardy */}
          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <AlertTriangle className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Top tardiness this period
              </h2>
            </header>
            {dashboard?.topTardy?.length ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2 text-left">Employee</th>
                    <th className="px-4 py-2 text-left">Department</th>
                    <th className="px-4 py-2 text-right">Tardy (min)</th>
                    <th className="px-4 py-2 text-right">Days late</th>
                    <th className="px-4 py-2 text-right">Absences</th>
                    <th className="px-5 py-2 text-right">Undertime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.topTardy.map((t) => (
                    <tr key={t.employeeId} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-2.5">
                        <Link to={`/employees/${t.employeeId}`}
                          className="font-medium text-brand-700 hover:underline">
                          {t.fullName}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">{t.employeeNumber}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{t.departmentName ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${
                        t.tardyMinutes > 0 ? 'text-amber-700' : 'text-slate-400'
                      }`}>{t.tardyMinutes}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-600">{t.tardyDays}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${
                        t.absenceDays > 0 ? 'font-semibold text-red-700' : 'text-slate-400'
                      }`}>{t.absenceDays}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-slate-600">{t.undertimeMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-center text-xs text-slate-500">
                No tardiness recorded in this period.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BigStat({ Icon, label, value, tone = 'neutral' }) {
  const tones = {
    neutral: { ring: 'ring-slate-200', text: 'text-slate-900', icon: 'text-slate-500 bg-slate-100' },
    amber:   { ring: 'ring-amber-200', text: 'text-amber-700', icon: 'text-amber-600 bg-amber-100' },
    red:     { ring: 'ring-red-200',   text: 'text-red-700',   icon: 'text-red-600 bg-red-100' },
    emerald: { ring: 'ring-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-600 bg-emerald-100' },
  }[tone];

  return (
    <div className={`rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-inset ${tones.ring}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-3xl font-bold tracking-tight ${tones.text}`}>{value}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones.icon}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
    </div>
  );
}