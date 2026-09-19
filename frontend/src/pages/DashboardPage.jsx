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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome back, {user?.username}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{role?.name ?? '—'}</span>
          {role?.authorityLevel !== undefined && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              Level {role.authorityLevel}
            </span>
          )}
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ to, label, Icon, soon }) => (
          <Link
            key={to}
            to={soon ? '#' : to}
            aria-disabled={soon}
            onClick={(e) => soon && e.preventDefault()}
            className={`group relative flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition ${
              soon ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md'
            }`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
              <p className="text-xs text-slate-500">
                {soon ? 'Coming in a later phase' : 'Open module'}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No modules are available for your role yet.
        </p>
      )}
    </div>
  );
}