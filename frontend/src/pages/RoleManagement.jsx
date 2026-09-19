import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ShieldCheck, Search, Save, RotateCcw, Loader2, AlertCircle,
  CheckCircle2, Lock, Users,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';

const PROTECTED_PERMISSION = 'roles.manage_permissions';

export default function RoleManagement() {
  const { user, reload } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

  /** matrix[roleId] = Set<permissionId> */
  const [matrix, setMatrix] = useState({});
  const [original, setOriginal] = useState({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  /* ---------------------------------------------------------------- *
   *  Load roles + permission catalogue
   * ---------------------------------------------------------------- */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/roles');
      const { roles: roleList, permissions: permList } = data.data;

      const initial = {};
      for (const r of roleList) initial[r.id] = new Set(r.permissionIds);

      setRoles(roleList);
      setPermissions(permList);
      setMatrix(initial);
      setOriginal(
        Object.fromEntries(
          Object.entries(initial).map(([k, v]) => [k, new Set(v)])
        )
      );
    } catch (err) {
      setLoadError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---------------------------------------------------------------- *
   *  Derived data
   * ---------------------------------------------------------------- */
  const modules = useMemo(
    () => ['all', ...[...new Set(permissions.map((p) => p.module))].sort()],
    [permissions]
  );

  const visiblePermissions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return permissions.filter((p) => {
      if (moduleFilter !== 'all' && p.module !== moduleFilter) return false;
      if (!q) return true;
      return (
        p.permissionName.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [permissions, query, moduleFilter]);

  /** Group visible permissions by module for section headers. */
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of visiblePermissions) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module).push(p);
    }
    return [...map.entries()];
  }, [visiblePermissions]);

  const dirtyRoles = useMemo(() => {
    const dirty = [];
    for (const role of roles) {
      const a = matrix[role.id] ?? new Set();
      const b = original[role.id] ?? new Set();
      if (a.size !== b.size || [...a].some((id) => !b.has(id))) dirty.push(role.id);
    }
    return dirty;
  }, [roles, matrix, original]);

  const totalChanges = useMemo(
    () =>
      dirtyRoles.reduce((sum, roleId) => {
        const a = matrix[roleId] ?? new Set();
        const b = original[roleId] ?? new Set();
        const added = [...a].filter((id) => !b.has(id)).length;
        const removed = [...b].filter((id) => !a.has(id)).length;
        return sum + added + removed;
      }, 0),
    [dirtyRoles, matrix, original]
  );

  const permissionNameById = useMemo(
    () => new Map(permissions.map((p) => [p.id, p.permissionName])),
    [permissions]
  );

  /* ---------------------------------------------------------------- *
   *  Mutations
   * ---------------------------------------------------------------- */
  const toggle = (roleId, permissionId) => {
    setSaveSuccess(null);
    setSaveError(null);
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? []);
      if (set.has(permissionId)) set.delete(permissionId);
      else set.add(permissionId);
      next[roleId] = set;
      return next;
    });
  };

  const toggleModuleForRole = (roleId, modulePerms, checked) => {
    setSaveSuccess(null);
    setSaveError(null);
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? []);
      for (const p of modulePerms) {
        if (checked) set.add(p.id);
        else set.delete(p.id);
      }
      next[roleId] = set;
      return next;
    });
  };

  const resetChanges = () => {
    setMatrix(
      Object.fromEntries(Object.entries(original).map(([k, v]) => [k, new Set(v)]))
    );
    setSaveError(null);
    setSaveSuccess(null);
  };

  async function saveChanges() {
    if (!dirtyRoles.length) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const results = await Promise.all(
        dirtyRoles.map((roleId) =>
          api
            .put(`/roles/${roleId}/permissions`, {
              permissionIds: [...(matrix[roleId] ?? [])],
            })
            .then(() => ({ roleId, ok: true }))
            .catch((err) => ({ roleId, ok: false, error: extractApiError(err) }))
        )
      );

      const failed = results.filter((r) => !r.ok);

      if (failed.length) {
        const first = failed[0].error;
        setSaveError(
          failed.length === 1
            ? first.message
            : `${failed.length} role updates failed. ${first.message}`
        );
        // Keep the failed roles dirty so the admin can retry.
        setOriginal((prev) => {
          const next = { ...prev };
          for (const r of results.filter((x) => x.ok)) {
            next[r.roleId] = new Set(matrix[r.roleId]);
          }
          return next;
        });
        return;
      }

      setOriginal(
        Object.fromEntries(
          Object.entries(matrix).map(([k, v]) => [k, new Set(v)])
        )
      );
      setSaveSuccess(
        `Saved permissions for ${dirtyRoles.length} role${dirtyRoles.length > 1 ? 's' : ''}.`
      );

      // Role change may affect the current admin — re-sync the session.
      await reload().catch(() => {});
    } catch (err) {
      setSaveError(extractApiError(err).message);
    } finally {
      setSaving(false);
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
        <Alert variant="error" title="Could not load roles">
          {loadError}
          <button
            type="button"
            onClick={load}
            className="mt-3 block rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Role &amp; Permission Management
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Toggle a cell to grant or revoke a permission. Changes apply to every
            user holding that role.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetChanges}
            disabled={!dirtyRoles.length || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={saveChanges}
            disabled={!dirtyRoles.length || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : `Save${totalChanges ? ` (${totalChanges})` : ''}`}
          </button>
        </div>
      </header>

      {/* Notifications */}
      {(saveError || saveSuccess) && (
        <div className="mt-5">
          {saveError && (
            <Alert variant="error" title="Save failed" onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}
          {saveSuccess && (
            <Alert variant="success" onClose={() => setSaveSuccess(null)}>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {saveSuccess}
              </span>
            </Alert>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions…"
            aria-label="Search permissions"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          aria-label="Filter by module"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          {modules.map((m) => (
            <option key={m} value={m}>
              {m === 'all' ? 'All modules' : m}
            </option>
          ))}
        </select>

        <p className="text-xs text-slate-500 sm:ml-auto">
          {visiblePermissions.length} of {permissions.length} permissions
          {dirtyRoles.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
              {dirtyRoles.length} unsaved role{dirtyRoles.length > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>

      {/* Matrix */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[280px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Permission
                </th>
                {roles.map((role) => {
                  const isCurrent = role.id === user?.roleId;
                  const isDirty = dirtyRoles.includes(role.id);
                  return (
                    <th
                      key={role.id}
                      scope="col"
                      className="min-w-[130px] border-b border-slate-200 px-3 py-3 text-center align-bottom"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-slate-800">
                          {role.roleName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-normal text-slate-400">
                          <Users className="h-3 w-3" />
                          {role.userCount}
                        </span>
                        {role.code === 'ADMIN' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            <Lock className="h-2.5 w-2.5" />
                            system
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                            you
                          </span>
                        )}
                        {isDirty && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    No permissions match your filters.
                  </td>
                </tr>
              )}

              {grouped.map(([moduleName, perms]) => (
                <>
                  {/* Module section header */}
                  <tr key={`hdr-${moduleName}`} className="bg-slate-100/70">
                    <th
                      scope="rowgroup"
                      className="sticky left-0 z-10 border-y border-slate-200 bg-slate-100/70 px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      {moduleName}
                    </th>
                    {roles.map((role) => {
                      const set = matrix[role.id] ?? new Set();
                      const allOn = perms.every((p) => set.has(p.id));
                      const someOn = !allOn && perms.some((p) => set.has(p.id));
                      return (
                        <td key={`hdr-${moduleName}-${role.id}`} className="border-y border-slate-200 px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={allOn}
                            ref={(el) => { if (el) el.indeterminate = someOn; }}
                            onChange={(e) => toggleModuleForRole(role.id, perms, e.target.checked)}
                            aria-label={`Toggle all ${moduleName} permissions for ${role.roleName}`}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                      );
                    })}
                  </tr>

                  {/* Permission rows */}
                  {perms.map((perm) => {
                    const isProtected = perm.permissionName === PROTECTED_PERMISSION;
                    return (
                      <tr key={perm.id} className="group hover:bg-brand-50/40">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-2.5 text-left font-normal group-hover:bg-brand-50/40"
                        >
                          <span className="block font-mono text-xs font-medium text-slate-800">
                            {perm.permissionName}
                          </span>
                          {perm.description && (
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {perm.description}
                            </span>
                          )}
                        </th>

                        {roles.map((role) => {
                          const checked = (matrix[role.id] ?? new Set()).has(perm.id);
                          return (
                            <td
                              key={`${perm.id}-${role.id}`}
                              className="border-b border-slate-100 px-3 py-2.5 text-center"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving}
                                onChange={() => toggle(role.id, perm.id)}
                                aria-label={`${perm.permissionName} for ${role.roleName}`}
                                title={
                                  isProtected
                                    ? 'At least one role must retain this permission.'
                                    : undefined
                                }
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 transition focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Unsaved changes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          System role — protected from lockout
        </span>
        <span>
          Module checkboxes toggle every permission in that module for a role.
        </span>
      </div>
    </div>
  );
}