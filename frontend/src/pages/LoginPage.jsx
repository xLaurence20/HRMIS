import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import laPazLogo from '../images/lapaz-logo.png';
import {
  Eye, EyeOff, Lock, User, ShieldCheck, Loader2, AlertCircle,
} from 'lucide-react';

/**
 * Municipality photo used as the login backdrop.
 * Drop your own file in /public/images/ and point this constant at it.
 */
const MUNICIPALITY_IMAGE = '../images/lapaz.jpg';

const HIGHLIGHTS = [
  'Role-based access control for all municipal offices',
  'Immutable audit trail on every HR transaction',
  'Civil Service compliant forms, leave cards, and reports',
];

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900">
      {/* ---------------- Full-Screen Background Image ---------------- */}
      <img
        src={MUNICIPALITY_IMAGE}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-sm"
      />

      {/* Global dark overlay to ensure text readability across the whole page */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/70 to-slate-950/85"
      />

      {/* ---------------- Content Container ---------------- */}
      <div className="relative z-10 flex w-full max-w-7xl flex-col lg:flex-row lg:items-center">
        
        {/* Left Side: Branding */}
        <aside className="hidden w-1/2 flex-col justify-between p-12 text-white lg:flex min-h-[650px]">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white/15 p-1 ring-1 ring-inset ring-white/25 backdrop-blur">
              <img
                src={laPazLogo}
                alt="Municipality of La Paz logo"
                className="h-full w-full object-contain"
              />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide">Municipality of La Paz</p>
              <p className="text-xs text-white/70">Agusan del Sur · Philippines</p>
            </div>
          </div>

          {/* Main Copy */}
          <div className="max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
              Republic of the Philippines
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight">
              Human Resource Management Information System
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Serving the Municipality of La Paz, Agusan del Sur — manage personnel
              records, attendance, leave credits, and terminal benefits under one
              auditable platform.
            </p>

            <ul className="mt-8 space-y-3 rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-white/85 backdrop-blur-md">
              {HIGHLIGHTS.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <p className="text-xs text-white/55">
            © {new Date().getFullYear()} Municipality of La Paz, Agusan del Sur.
            All rights reserved.
          </p>
        </aside>

        {/* Right Side: Login Form inside a Frosted Glass Card */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
          {/* Enhanced Glassmorphism Effect: lower opacity bg, stronger blur, softer border */}
          <div className="w-full max-w-md rounded-3xl border border-white/30 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl animate-fade-in">
            
            {/* ✨ New: Bigger Logo at the top of the form ✨ */}
            <div className="mb-8 flex flex-col items-center text-center">
              <img
                src={laPazLogo}
                alt="Municipality of La Paz logo"
                className="h-20 w-20 object-contain drop-shadow-md sm:h-24 sm:w-24"
              />
              <p className="mt-3 text-sm font-bold tracking-tight text-slate-900">HRMIS</p>
              <p className="text-[10px] text-slate-500">Municipality of La Paz</p>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-center">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 text-center">
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
                    className={`block w-full rounded-lg border bg-white/90 py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-offset-0 ${
                      fieldErrors.username
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                    }`}
                    placeholder="juan.delacruz"
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
                    className={`block w-full rounded-lg border bg-white/90 py-2.5 pl-10 pr-11 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-offset-0 ${
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
              Trouble signing in? Contact the{' '}
              <Link to="/help" className="font-medium text-brand-600 hover:text-brand-700">
                Municipal HR Office
              </Link>
              .
            </p>
          </div>
        </main>

      </div>
    </div>
  );
}