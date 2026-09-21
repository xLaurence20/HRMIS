import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  ShieldCheck, LayoutDashboard, Shield, User, LogOut, Menu, X,
  Users, Building2, Briefcase, Network,
  CalendarClock, TrendingDown, Calendar, Wallet, Inbox, FileText,
  PanelLeftClose, PanelLeftOpen,
  BarChart3, History,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// 👇 Adjust this path to match where you saved your La Paz logo
import laPazLogo from '../images/lapaz-logo.png';

const NAV = [
  { to: '/',            label: 'Dashboard',   Icon: LayoutDashboard },
  { to: '/employees',   label: 'Employees',   Icon: Users,         permission: 'employees.view' },
  { to: '/departments', label: 'Departments', Icon: Building2,     permission: 'departments.view' },
  { to: '/positions',   label: 'Positions',   Icon: Briefcase,     permission: 'positions.view' },
  { to: '/org',         label: 'Org Chart',   Icon: Network,       permission: 'departments.view' },
  { to: '/dtr',         label: 'DTR',         Icon: CalendarClock, permission: 'dtr.view' },
  { to: '/attendance',  label: 'Attendance',  Icon: TrendingDown,  permission: 'attendance.view' },
  { to: '/holidays',    label: 'Holidays',    Icon: Calendar,      permission: 'dtr.view' },
  { to: '/leaves/my',   label: 'My Leaves',   Icon: FileText,      permission: 'leave.view' },
  { to: '/leaves/inbox',label: 'Approvals',   Icon: Inbox,         permission: ['leave.review','leave.approve'] },
  { to: '/leave-dashboard', label: 'Leave',   Icon: Wallet,        permission: 'leave_credits.view' },
  { to: '/reports',     label: 'Reports',     Icon: BarChart3,     permission: 'reports.view' },
  { to: '/audit',       label: 'Audit',       Icon: History,       permission: 'audit_logs.view' },
  { to: '/roles',       label: 'Roles',       Icon: Shield,        permission: 'roles.view' },
  { to: '/profile/setup', label: 'My Profile', Icon: User },
];

export default function AppShell() {
  const { user, role, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  // Sidebar states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop expand/collapse
  const [isMobileOpen, setIsMobileOpen] = useState(false);  // Mobile drawer

  const links = NAV.filter((n) => {
    if (!n.permission) return true;
    return hasPermission(n.permission);
  });

  const initials = (user?.username?.[0] ?? '').toUpperCase() || '?';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-all duration-300 lg:static lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isSidebarOpen ? 'lg:w-64' : 'lg:w-20'}`}
      >
        {/* Sidebar Header (Logo + HRMIS) */}
        <div
          className={`flex h-16 shrink-0 items-center border-b border-slate-100 ${
            isSidebarOpen ? 'gap-3 px-4' : 'gap-3 px-4 lg:justify-center lg:px-0'
          }`}
        >
          <img
            src={laPazLogo}
            alt="Municipality of La Paz logo"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span
            className={`text-sm font-bold tracking-tight text-slate-900 ${
              !isSidebarOpen ? 'lg:hidden' : ''
            }`}
          >
            HRMIS
          </span>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={!isSidebarOpen ? label : undefined} // Tooltip when collapsed
              onClick={() => setIsMobileOpen(false)} // Close mobile drawer on click
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                } ${!isSidebarOpen ? 'lg:justify-center lg:px-2' : ''}`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={`${!isSidebarOpen ? 'lg:hidden' : ''}`}>
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer (User Info + Logout) */}
        <div className="border-t border-slate-200 p-4">
          <div
            className={`flex items-center ${
              isSidebarOpen ? 'gap-3' : 'justify-center'
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials}
            </span>
            {isSidebarOpen && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {user?.username}
                </p>
                <p className="truncate text-xs text-slate-500">{role?.name}</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title={!isSidebarOpen ? 'Sign out' : undefined}
            className={`mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 ${
              !isSidebarOpen ? 'lg:justify-center lg:px-2' : ''
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {isSidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ---------------- Main Content Area ---------------- */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-4">
            {/* Mobile Hamburger Menu */}
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop Sidebar Toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="hidden rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:block"
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Mobile-only user avatar (since the sidebar shows it on desktop) */}
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </span>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-16">
          {/* Incomplete Profile Banner */}
          {user && !user.profileCompleted && (
            <div className="border-b border-amber-200 bg-amber-50">
              <div className="mx-auto max-w-7xl px-4 py-2.5 text-center text-xs text-amber-800 sm:px-6 lg:px-8">
                Your profile is incomplete. Some modules will be unavailable until you finish it.
              </div>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  );
}