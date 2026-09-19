import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  ShieldCheck, LayoutDashboard, Shield, User, LogOut, Menu, X,
  Users, Building2, Briefcase, Network,
  CalendarClock, TrendingDown, Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/',            label: 'Dashboard',   Icon: LayoutDashboard },
  { to: '/employees',   label: 'Employees',   Icon: Users,         permission: 'employees.view' },
  { to: '/departments', label: 'Departments', Icon: Building2,     permission: 'departments.view' },
  { to: '/positions',   label: 'Positions',   Icon: Briefcase,     permission: 'positions.view' },
  { to: '/org',         label: 'Org Chart',   Icon: Network,       permission: 'departments.view' },
  { to: '/dtr',         label: 'DTR',         Icon: CalendarClock, permission: 'dtr.view' },
  { to: '/attendance',  label: 'Attendance',  Icon: TrendingDown,  permission: 'attendance.view' },
  { to: '/holidays',    label: 'Holidays',    Icon: Calendar,      permission: 'dtr.view' },
  { to: '/roles',       label: 'Roles',       Icon: Shield,        permission: 'roles.view' },
  { to: '/profile/setup', label: 'My Profile', Icon: User },
];

export default function AppShell() {
  const { user, role, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = NAV.filter((n) => !n.permission || hasPermission(n.permission));
  const initials = (user?.username?.[0] ?? '').toUpperCase() || '?';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-900">HRMIS</span>
          </div>

          <nav className="ml-6 hidden items-center gap-0.5 lg:flex">
            {links.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-900">
                {user?.username}
              </p>
              <p className="text-xs leading-tight text-slate-500">{role?.name}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials}
            </span>
            <button type="button" onClick={handleLogout} title="Sign out" aria-label="Sign out"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
            {links.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {user && !user.profileCompleted && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-center text-xs text-amber-800 sm:px-6 lg:px-8">
            Your profile is incomplete. Some modules will be unavailable until you finish it.
          </div>
        </div>
      )}

      <main className="pb-16">
        <Outlet />
      </main>
    </div>
  );
}