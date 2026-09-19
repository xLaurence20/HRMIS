import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Eye, EyeOff, Lock, User, ShieldCheck, Loader2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname ?? '/';

  // Already authenticated? Bounce straight through.
  useEffect(() => {
    if (status === 'authenticated') navigate(redirectTo, { replace: true });
  }, [status, navigate, redirectTo]);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setServerError(null);
  };

  function validate() {
    const errors = {};
    if (!form.username.trim()) errors.username = 'Username or email is required.';
    if (!form.password) errors.password = 'Password is required.';
    else if (form.password.length < 6) errors.password = 'Password looks too short.';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);

    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    const result = await login(form.username.trim(), form.password);
    setSubmitting(false);

    if (result.ok) {
      navigate(redirectTo, { replace: true });
      return;
    }

    const { code, message, details } = result.error ?? {};
    if (code === 'VALIDATION_ERROR' && details?.fields) {
      setFieldErrors(
        Object.fromEntries(details.fields.map((f) => [f.field, f.message]))
      );
    }
    setServerError(message ?? 'Unable to sign in.');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ---------------- Branding panel (desktop) ---------------- */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5"
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">HRMIS</p>
            <p className="text-xs text-white/70">Human Resource Management Information System</p>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Secure access for government HR operations.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            Manage personnel records, attendance, leave credits, and terminal
            benefits under one auditable platform.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/85">
            {[
              'Role-based access control across 8 roles',
              'Immutable audit trail on every transaction',
              'Civil Service compliant forms and reports',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/50">
          © {new Date().getFullYear()} HRMIS. All rights reserved.
        </p>
      </aside>

      {/* ---------------- Login form ---------------- */}
      <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-slate-900">HRMIS</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in to your account
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter your credentials to continue.
          </p>

          {serverError && (
            <div
              role="alert"
              className="mt-6 flex animate-slide-up items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                Username or Email
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={form.username}
                  onChange={update('username')}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                  className={`block w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-offset-0 ${
                    fieldErrors.username
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                  placeholder="sysadmin"
                />
              </div>
              {fieldErrors.username && (
                <p id="username-error" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={update('password')}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={`block w-full rounded-lg border bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-offset-0 ${
                    fieldErrors.password
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Trouble signing in? Contact your{' '}
            <Link to="/help" className="font-medium text-brand-600 hover:text-brand-700">
              system administrator
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}