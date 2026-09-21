import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Wallet, TrendingUp, AlertTriangle, Calendar,
  Loader2, RefreshCw, ArrowRight, Award, Clock, UserCheck,
  BarChart3, PieChart, Inbox,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function ExecutiveDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get(`/dashboard/executive?year=${year}&month=${month}`);
      setData(data.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Executive Dashboard
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Agency-wide KPIs across personnel, leave, and attendance for {MONTHS[month - 1]} {year}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
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
          {/* Row 1: Headcount KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard Icon={Users} label="Total personnel" value={data.headcount.total}
              tone="brand" hint={`${data.headcount.active} active`} />
            <KpiCard Icon={UserCheck} label="Permanent"
              value={data.headcount.permanent}
              tone="emerald"
              hint={`${data.headcount.nonPermanent} non-permanent`} />
            <KpiCard Icon={Wallet} label="Leave liability"
              value={`₱${(data.leaveLiability.totalLiability / 1000).toFixed(1)}K`}
              tone="amber"
              hint={`${data.leaveLiability.totalEncashableDays.toFixed(0)} encashable days`} />
            <KpiCard Icon={Clock} label="Attendance compliance"
              value={data.attendance.complianceRate != null
                ? `${data.attendance.complianceRate}%`
                : '—'}
              tone={data.attendance.complianceRate >= 90 ? 'emerald'
                    : data.attendance.complianceRate >= 70 ? 'amber' : 'red'}
              hint={`${data.attendance.compliant} of ${data.attendance.employeesWithSummary}`} />
          </div>

          {/* Row 2: Secondary KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MiniStat label="Pending approvals" value={data.pendingApprovals.total}
              sub={`${data.pendingApprovals.supervisor} supervisor · ${data.pendingApprovals.approver} approver`}
              Icon={Inbox} />
            <MiniStat label="Total tardy (min)" value={data.attendance.totalTardyMinutes}
              sub="this month" Icon={Clock} />
            <MiniStat label="Absence days" value={data.attendance.totalAbsenceDays}
              sub="this month" Icon={Calendar} />
            <MiniStat label="Departments" value={data.byDepartment.length}
              sub={`${data.headcount.active} employees assigned`} Icon={Building2} />
          </div>

          {/* Row 3: Charts */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Headcount by department */}
            <section className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Headcount by department
                  </h2>
                </div>
                <Link to="/org" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View org chart →
                </Link>
              </header>
              <div className="px-5 py-5">
                {data.byDepartment.length === 0 ? (
                  <Empty text="No departments configured." />
                ) : (
                  <ul className="space-y-3">
                    {data.byDepartment.slice(0, 8).map((d) => {
                      const max = Math.max(...data.byDepartment.map(x => x.employeeCount), 1);
                      const pct = (d.employeeCount / max) * 100;
                      return (
                        <li key={d.id}>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="font-medium text-slate-700 truncate">{d.name}</span>
                            <span className="ml-3 font-mono text-slate-500">
                              <strong className="text-slate-700">{d.employeeCount}</strong>
                              {d.permanentCount > 0 && (
                                <span className="ml-1.5 text-[10px] text-emerald-700">
                                  {d.permanentCount} perm
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Employment status donut */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <PieChart className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  By status
                </h2>
              </header>
              <div className="px-5 py-5">
                {data.byStatus.length === 0 ? (
                  <Empty text="No data." />
                ) : (
                  <ul className="space-y-2.5">
                    {data.byStatus.map((s) => {
                      const total = data.headcount.active || 1;
                      const pct = (s.count / total) * 100;
                      return (
                        <li key={s.status} className="flex items-center gap-3 text-xs">
                          <span className={`h-2.5 w-2.5 rounded-full ${
                            s.status === 'Permanent' ? 'bg-emerald-500'
                            : s.status === 'Temporary' ? 'bg-amber-500'
                            : s.status === 'Coterminous' ? 'bg-brand-500'
                            : 'bg-slate-400'
                          }`} />
                          <span className="flex-1 text-slate-700">{s.status}</span>
                          <span className="font-mono font-semibold text-slate-800">{s.count}</span>
                          <span className="w-10 text-right font-mono text-slate-400">
                            {pct.toFixed(0)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* Row 4: Leave liability + Salary grade distribution */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <Wallet className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Leave liability by type
                </h2>
              </header>
              <div className="px-5 py-4">
                {data.leaveLiability.byType.length === 0 ? (
                  <Empty text="No encashable leave types." />
                ) : (
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 text-left font-semibold">Type</th>
                        <th className="py-2 text-right font-semibold">Employees</th>
                        <th className="py-2 text-right font-semibold">Days</th>
                        <th className="py-2 text-right font-semibold">Liability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.leaveLiability.byType.map((t) => (
                        <tr key={t.code}>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.colorHex }} />
                              <span className="font-medium text-slate-700">{t.code}</span>
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono text-slate-600">{t.employeeCount}</td>
                          <td className="py-2 text-right font-mono text-slate-600">{t.totalDays.toFixed(1)}</td>
                          <td className="py-2 text-right font-mono font-semibold text-slate-800">
                            ₱{t.totalLiability.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200">
                        <td colSpan={3} className="py-2 text-right font-semibold text-slate-600">
                          Total
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-900">
                          ₱{data.leaveLiability.totalLiability.toLocaleString('en-PH', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
                <p className="mt-3 text-[10px] text-slate-400">
                  Daily rate = monthly salary ÷ {data.leaveLiability.workingDaysPerMonth} days
                </p>
              </div>
            </section>

            {/* Salary grade distribution */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <Award className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Salary grade distribution
                </h2>
              </header>
              <div className="px-5 py-5">
                {data.bySalaryGrade.length === 0 ? (
                  <Empty text="No salary grade data." />
                ) : (
                  <ul className="space-y-2">
                    {data.bySalaryGrade.map((s) => {
                      const max = Math.max(...data.bySalaryGrade.map(x => x.count), 1);
                      const pct = (s.count / max) * 100;
                      return (
                        <li key={s.salaryGrade} className="flex items-center gap-3 text-xs">
                          <span className="w-12 font-mono text-slate-500">SG-{s.salaryGrade}</span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600"
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right font-mono font-semibold text-slate-700">
                            {s.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* Row 5: Age + gender + recent hires */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <DemographicCard title="Age distribution" Icon={Users} rows={
              data.byAge.map((a) => ({ label: a.bucket, count: a.count }))
            } />
            <DemographicCard title="Gender distribution" Icon={Users} rows={
              data.byGender.map((g) => ({ label: g.gender, count: g.count }))
            } />

            {/* Recent hires */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Recent hires
                </h2>
              </header>
              <div className="px-5 py-3">
                {data.recentHires.length === 0 ? (
                  <Empty text="No hires in the last 90 days." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.recentHires.slice(0, 5).map((h) => (
                      <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
                        <Link to={`/employees/${h.id}`}
                          className="block text-xs hover:text-brand-600">
                          <p className="font-medium text-slate-800 truncate">{h.fullName}</p>
                          <p className="text-slate-500 truncate">
                            {h.positionTitle ?? '—'}
                            {h.departmentCode && <> · {h.departmentCode}</>}
                          </p>
                          <p className="text-[10px] text-slate-400">Hired {h.dateHired}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* Row 6: Hire trend */}
          {data.hireTrend.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Hire trend (last 12 months)
                </h2>
              </header>
              <div className="px-5 py-5">
                <div className="flex h-24 items-end gap-2">
                  {data.hireTrend.map((t) => {
                    const max = Math.max(...data.hireTrend.map(x => x.hires), 1);
                    const h = Math.max(8, (t.hires / max) * 100);
                    return (
                      <div key={t.label} className="group relative flex-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-emerald-400 transition hover:from-emerald-600 hover:to-emerald-500"
                          style={{ height: `${h}%` }}
                        />
                        <p className="mt-1 text-center text-[9px] text-slate-400">{t.label.slice(2)}</p>
                        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                          {t.hires} hire{t.hires !== 1 ? 's' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---- Small components ---- */

function KpiCard({ Icon, label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: { ring: 'ring-slate-200', text: 'text-slate-900', icon: 'bg-slate-100 text-slate-500' },
    brand:   { ring: 'ring-brand-200', text: 'text-brand-800', icon: 'bg-brand-100 text-brand-700' },
    emerald: { ring: 'ring-emerald-200', text: 'text-emerald-800', icon: 'bg-emerald-100 text-emerald-700' },
    amber:   { ring: 'ring-amber-200', text: 'text-amber-800', icon: 'bg-amber-100 text-amber-700' },
    red:     { ring: 'ring-red-200', text: 'text-red-800', icon: 'bg-red-100 text-red-700' },
  }[tone];

  return (
    <div className={`rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-inset ${tones.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold tracking-tight ${tones.text}`}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function MiniStat({ Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-slate-800">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-400 truncate">{sub}</p>}
    </div>
  );
}

function DemographicCard({ title, Icon, rows }) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <Icon className="h-4 w-4 text-slate-500" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h2>
      </header>
      <div className="px-5 py-4">
        {rows.length === 0 ? <Empty text="No data." /> : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-slate-600">{r.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                    style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-slate-700">{r.count}</span>
                <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-400">
                  {((r.count / total) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Empty({ text }) {
  return <p className="py-4 text-center text-xs text-slate-400">{text}</p>;
}