import { Link } from 'react-router-dom';
import { Users, ShieldCheck, Clock, CalendarDays, FileText, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CARDS = [
  { to: '/roles',     label: 'Role & Permissions', Icon: ShieldCheck, permission: 'roles.view' },
  { to: '/profile/setup', label: 'My Profile',     Icon: Users,       permission: 'profile.view' },
  { to: '/dtr',       label: 'Daily Time Records', Icon: Clock,       permission: 'dtr.view',      soon: true },
  { to: '/leave',     label: 'Leave Management',   Icon: CalendarDays,permission: 'leave.view',    soon: true },
  { to: '/service-records', label: 'Service Records', Icon: FileText, permission: 'service_records.view', soon: true },
  { to: '/tlb',       label: 'Terminal Leave',     Icon: Wallet,      permission: 'tlb.view',      soon: true },
];

export default function DashboardPage() {
  const { user, role, hasPermission } = useAuth();

  const visible = CARDS.filter((c) => hasPermission(c.permission));

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* ---------------- Header ---------------- */}
      <header className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Welcome back, {user?.username}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{role?.name ?? '—'}</span>
          {role?.authorityLevel !== undefined && (
            <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Level {role.authorityLevel}
            </span>
          )}
        </p>
      </header>

      {/* ---------------- Module Grid ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ to, label, Icon, soon }) => (
          <Link
            key={to}
            to={soon ? '#' : to}
            aria-disabled={soon}
            onClick={(e) => soon && e.preventDefault()}
            className={`group relative flex items-center gap-5 rounded-2xl border p-5 transition-all duration-200 ${
              soon
                ? 'cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-60'
                : 'border-slate-100 bg-white hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-sm'
            }`}
          >
            {/* Icon Container */}
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                soon
                  ? 'bg-slate-100 text-slate-400'
                  : 'bg-brand-50 text-brand-600 group-hover:bg-brand-100'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>

            {/* Text Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                {soon && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-slate-200/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {soon ? 'Not yet available' : 'Open module'}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* ---------------- Empty State ---------------- */}
      {visible.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
          <p className="text-sm font-medium text-slate-500">
            No modules are available for your role yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Please contact your system administrator if you believe this is an error.
          </p>
        </div>
      )}
    </div>
  );
}