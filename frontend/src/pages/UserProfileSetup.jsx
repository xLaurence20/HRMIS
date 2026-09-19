import { useEffect, useState, useMemo } from 'react';
import {
  User, Phone, Building2, Briefcase, Image as ImageIcon, Save,
  Loader2, CheckCircle2, KeyRound, ShieldCheck, Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';

const TABS = [
  { id: 'profile',  label: 'Profile',          Icon: User },
  { id: 'security', label: 'Security',         Icon: KeyRound },
  { id: 'access',   label: 'Role & Access',    Icon: ShieldCheck },
];

const EMPTY_FORM = {
  firstName: '', middleName: '', lastName: '', extensionName: '',
  phone: '', departmentId: '', position: '', avatarUrl: '',
};

export default function UserProfileSetup() {
  const { reload, user } = useAuth();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [role, setRole] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  /* ---------------------------------------------------------------- *
   *  Password form state
   * ---------------------------------------------------------------- */
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwVisible, setPwVisible] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwServerError, setPwServerError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(null);

  /* ---------------------------------------------------------------- *
   *  Load profile + departments
   * ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [profileRes, deptRes] = await Promise.all([
          api.get('/profile/me'),
          api.get('/profile/departments').catch(() => ({ data: { data: { departments: [] } } })),
        ]);

        if (cancelled) return;

        const { profile, role: roleData, permissions: perms } = profileRes.data.data;

        setForm({
          firstName: profile?.firstName ?? '',
          middleName: profile?.middleName ?? '',
          lastName: profile?.lastName ?? '',
          extensionName: profile?.extensionName ?? '',
          phone: profile?.phone ?? '',
          departmentId: profile?.departmentId ? String(profile.departmentId) : '',
          position: profile?.position ?? '',
          avatarUrl: profile?.avatarUrl ?? '',
        });
        setRole(roleData ?? null);
        setPermissions(perms ?? []);
        setDepartments(deptRes.data.data.departments ?? []);
      } catch (err) {
        if (!cancelled) setLoadError(extractApiError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  /* ---------------------------------------------------------------- *
   *  Grouped permissions for the Access tab
   * ---------------------------------------------------------------- */
  const groupedPermissions = useMemo(() => {
    const map = new Map();
    for (const name of permissions) {
      const module = name.split('.')[0];
      if (!map.has(module)) map.set(module, []);
      map.get(module).push(name);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  /* ---------------------------------------------------------------- *
   *  Profile handlers
   * ---------------------------------------------------------------- */
  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  function validateProfile() {
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (form.phone && !/^[0-9+()\-\s]{7,20}$/.test(form.phone.trim()))
      errors.phone = 'Enter a valid phone number.';
    if (form.avatarUrl && !/^https?:\/\/.+/i.test(form.avatarUrl.trim()))
      errors.avatarUrl = 'Must be a valid http(s) URL.';
    return errors;
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const errors = validateProfile();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await api.put('/profile/setup', {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        lastName: form.lastName.trim(),
        extensionName: form.extensionName.trim() || null,
        phone: form.phone.trim() || null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        position: form.position.trim() || null,
        avatarUrl: form.avatarUrl.trim() || null,
      });

      setSaveSuccess('Profile saved successfully.');
      await reload().catch(() => {});
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- *
   *  Password handlers
   * ---------------------------------------------------------------- */
  const updatePw = (key) => (e) => {
    setPwForm((f) => ({ ...f, [key]: e.target.value }));
    setPwErrors((fe) => ({ ...fe, [key]: undefined }));
    setPwServerError(null);
    setPwSuccess(null);
  };

  function validatePassword() {
    const errors = {};
    if (!pwForm.current) errors.current = 'Current password is required.';

    const next = pwForm.next;
    if (!next) errors.next = 'New password is required.';
    else {
      const rules = [];
      if (next.length < 12) rules.push('at least 12 characters');
      if (!/[A-Z]/.test(next)) rules.push('an uppercase letter');
      if (!/[a-z]/.test(next)) rules.push('a lowercase letter');
      if (!/\d/.test(next)) rules.push('a number');
      if (!/[^A-Za-z0-9]/.test(next)) rules.push('a symbol');
      if (rules.length) errors.next = `Must contain ${rules.join(', ')}.`;
    }

    if (pwForm.confirm !== pwForm.next) errors.confirm = 'Passwords do not match.';
    return errors;
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwServerError(null);
    setPwSuccess(null);

    const errors = validatePassword();
    if (Object.keys(errors).length) {
      setPwErrors(errors);
      return;
    }

    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      setPwSuccess('Password updated. Redirecting to sign in…');
      setPwForm({ current: '', next: '', confirm: '' });
      // Server revoked all sessions — force a clean re-login.
      setTimeout(() => { window.location.href = '/login'; }, 1600);
    } catch (err) {
      setPwServerError(extractApiError(err).message);
    } finally {
      setPwSaving(false);
    }
  }

  /* ---------------------------------------------------------------- *
   *  Render
   * ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Alert variant="error" title="Could not load your profile">{loadError}</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {user?.profileCompleted ? 'My Profile' : 'Complete Your Profile'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {user?.profileCompleted
            ? 'Review and update your personal information and account security.'
            : 'Tell us who you are. This information appears on official HR documents.'}
        </p>
      </header>

      {/* Tabs */}
      <nav className="mt-6 flex gap-1 border-b border-slate-200" aria-label="Profile sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* ============================ PROFILE TAB ============================ */}
      {activeTab === 'profile' && (
        <form onSubmit={handleProfileSubmit} noValidate className="mt-6 animate-fade-in space-y-6">
          {saveError && <Alert variant="error" title="Save failed">{saveError}</Alert>}
          {saveSuccess && (
            <Alert variant="success" onClose={() => setSaveSuccess(null)}>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />{saveSuccess}
              </span>
            </Alert>
          )}

          {/* Avatar preview */}
          <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {form.avatarUrl ? (
              <img
                src={form.avatarUrl}
                alt=""
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="h-16 w-16 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                {(form.firstName?.[0] ?? '') + (form.lastName?.[0] ?? '') || '—'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <label htmlFor="avatarUrl" className="block text-sm font-medium text-slate-700">
                Avatar URL
              </label>
              <div className="relative mt-1.5">
                <ImageIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="avatarUrl"
                  type="url"
                  value={form.avatarUrl}
                  onChange={update('avatarUrl')}
                  placeholder="https://example.gov.ph/photo.jpg"
                  className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              {fieldErrors.avatarUrl && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.avatarUrl}</p>
              )}
            </div>
          </div>

          {/* Name */}
          <fieldset className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <legend className="sr-only">Name</legend>

            <Field
              id="firstName" label="First name" required
              value={form.firstName} onChange={update('firstName')}
              error={fieldErrors.firstName} autoComplete="given-name"
            />
            <Field
              id="middleName" label="Middle name"
              value={form.middleName} onChange={update('middleName')}
              autoComplete="additional-name"
            />
            <Field
              id="lastName" label="Last name" required
              value={form.lastName} onChange={update('lastName')}
              error={fieldErrors.lastName} autoComplete="family-name"
            />
            <Field
              id="extensionName" label="Extension name"
              value={form.extensionName} onChange={update('extensionName')}
              placeholder="Jr., Sr., III" hint="Optional"
            />
          </fieldset>

          {/* Contact & assignment */}
          <fieldset className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <legend className="sr-only">Contact and assignment</legend>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
                Mobile number
              </label>
              <div className="relative mt-1.5">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  autoComplete="tel"
                  placeholder="+63 912 345 6789"
                  className={`block w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 ${
                    fieldErrors.phone
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                />
              </div>
              {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
            </div>

            <div>
              <label htmlFor="departmentId" className="block text-sm font-medium text-slate-700">
                Department
              </label>
              <div className="relative mt-1.5">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="departmentId"
                  value={form.departmentId}
                  onChange={update('departmentId')}
                  className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">— Not set —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
              {departments.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  No departments have been configured yet.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="position" className="block text-sm font-medium text-slate-700">
                Position / Designation
              </label>
              <div className="relative mt-1.5">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="position"
                  type="text"
                  value={form.position}
                  onChange={update('position')}
                  placeholder="Administrative Officer II"
                  className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}

      {/* ============================ SECURITY TAB ============================ */}
      {activeTab === 'security' && (
        <form onSubmit={handlePasswordSubmit} noValidate className="mt-6 max-w-lg animate-fade-in space-y-5">
          {pwServerError && <Alert variant="error" title="Could not update password">{pwServerError}</Alert>}
          {pwSuccess && (
            <Alert variant="success" onClose={() => setPwSuccess(null)}>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />{pwSuccess}
              </span>
            </Alert>
          )}

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            Password policy: minimum <strong>12 characters</strong>, with an uppercase
            letter, a lowercase letter, a number, and a symbol. Changing your password
            signs you out of every device.
          </p>

          {[
            { key: 'current', label: 'Current password', ac: 'current-password' },
            { key: 'next',    label: 'New password',     ac: 'new-password' },
            { key: 'confirm', label: 'Confirm new password', ac: 'new-password' },
          ].map(({ key, label, ac }) => (
            <div key={key}>
              <label htmlFor={`pw-${key}`} className="block text-sm font-medium text-slate-700">
                {label}
              </label>
              <div className="relative mt-1.5">
                <input
                  id={`pw-${key}`}
                  type={pwVisible[key] ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={updatePw(key)}
                  autoComplete={ac}
                  className={`block w-full rounded-lg border bg-white py-2 pl-3 pr-11 text-sm outline-none transition focus:ring-2 ${
                    pwErrors[key]
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setPwVisible((v) => ({ ...v, [key]: !v[key] }))}
                  aria-label={pwVisible[key] ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {pwVisible[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwErrors[key] && <p className="mt-1 text-xs text-red-600">{pwErrors[key]}</p>}
            </div>
          ))}

          <div className="flex justify-end border-t border-slate-200 pt-5">
            <button
              type="submit"
              disabled={pwSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}

      {/* ============================ ACCESS TAB ============================ */}
      {activeTab === 'access' && (
        <div className="mt-6 animate-fade-in space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Assigned role
                </p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">
                  {role?.name ?? '—'}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{role?.code}</p>
              </div>
              <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {permissions.length} permission{permissions.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {permissions.length === 0 ? (
            <Alert variant="info">
              No permissions are assigned to your role. Contact an administrator.
            </Alert>
          ) : (
            <div className="space-y-4">
              {groupedPermissions.map(([module, perms]) => (
                <section key={module} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {module}
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {perms.map((p) => (
                      <li
                        key={p}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-800"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Permissions are read-only here. To change them, contact an administrator
            with access to Role &amp; Permission Management.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Small reusable text field
 * ------------------------------------------------------------------ */
function Field({ id, label, required, error, hint, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1.5 text-xs font-normal text-slate-400">({hint})</span>}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}