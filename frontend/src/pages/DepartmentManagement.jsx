import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Building2, ChevronRight, ChevronDown,
  Users, UserCog, RefreshCw, Network,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

const EMPTY = {
  code: '', name: '', shortName: '', parentId: '',
  officeType: 'department', costCenter: '', location: '',
  sortOrder: 0, isActive: true,
};

const OFFICE_TYPES = ['department', 'division', 'section', 'unit'];

export default function DepartmentManagement() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('departments.manage');

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/departments/tree');
      setTree(data.data.tree ?? []);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Flat list for the parent selector (excludes the node being edited and its descendants)
  const flat = useMemo(() => {
    const out = [];
    const walk = (nodes, depth = 0) => {
      for (const n of nodes) {
        out.push({ id: n.id, name: n.name, code: n.code, depth });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  const descendantIds = useMemo(() => {
    if (!editing) return new Set();
    const ids = new Set();
    const walk = (node) => { ids.add(node.id); node.children?.forEach(walk); };
    const find = (nodes) => {
      for (const n of nodes) {
        if (n.id === editing.id) { walk(n); return true; }
        if (n.children && find(n.children)) return true;
      }
      return false;
    };
    find(tree);
    return ids;
  }, [tree, editing]);

  function openCreate(parentId = '') {
    setEditing(null);
    setForm({ ...EMPTY, parentId: parentId ? String(parentId) : '' });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(dept) {
    setEditing(dept);
    setForm({
      code: dept.code,
      name: dept.name,
      shortName: dept.shortName ?? '',
      parentId: dept.parentId ? String(dept.parentId) : '',
      officeType: dept.officeType,
      costCenter: dept.costCenter ?? '',
      location: dept.location ?? '',
      sortOrder: dept.sortOrder ?? 0,
      isActive: dept.isActive,
    });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setFormError(null);
  };

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setFormError(null);

    const errs = {};
    if (!form.code.trim()) errs.code = 'Required.';
    if (!/^[A-Z0-9-]+$/.test(form.code.trim())) errs.code = 'Use A-Z, 0-9, or hyphens.';
    if (!form.name.trim()) errs.name = 'Required.';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      shortName: form.shortName.trim() || null,
      parentId: form.parentId ? Number(form.parentId) : null,
      officeType: form.officeType,
      costCenter: form.costCenter.trim() || null,
      location: form.location.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editing) await api.put(`/departments/${editing.id}`, payload);
      else await api.post('/departments', payload);
      setFormOpen(false);
      load();
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/departments/${confirmDelete.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Building2 className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Department Management
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Organizational units, hierarchy, and department heads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              New department
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mt-6">
          <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : tree.length === 0 ? (
          <EmptyState
            Icon={Building2}
            title="No departments configured"
            description="Create the top-level departments to begin building your organizational structure."
            action={canManage && (
              <button
                type="button"
                onClick={() => openCreate()}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Add department
              </button>
            )}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {tree.map((node) => (
              <DepartmentNode
                key={node.id}
                node={node}
                depth={0}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={setConfirmDelete}
                onAddChild={openCreate}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Form modal */}
      <Modal
        open={formOpen}
        onClose={saving ? () => {} : () => setFormOpen(false)}
        title={editing ? 'Edit department' : 'New department'}
        size="lg"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create')}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><Alert variant="error">{formError}</Alert></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id="code" label="Code" required value={form.code} onChange={update('code')}
              error={fieldErrors.code} placeholder="HRMO" />
            <Field id="shortName" label="Short name" value={form.shortName}
              onChange={update('shortName')} placeholder="HRMO" />
          </div>
          <Field id="name" label="Full name" required value={form.name} onChange={update('name')}
            error={fieldErrors.name} placeholder="Human Resource Management Office" />

          <div className="grid grid-cols-2 gap-4">
            <SelectField id="officeType" label="Office type" value={form.officeType}
              onChange={update('officeType')} options={OFFICE_TYPES} />
            <SelectField id="parentId" label="Parent department"
              value={form.parentId} onChange={update('parentId')}
              options={[
                { value: '', label: '— None (top-level) —' },
                ...flat
                  .filter((n) => !editing || !descendantIds.has(n.id))
                  .map((n) => ({
                    value: n.id,
                    label: `${'— '.repeat(n.depth)}${n.name}`,
                  })),
              ]} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="costCenter" label="Cost center"
              value={form.costCenter} onChange={update('costCenter')} />
            <Field id="sortOrder" label="Sort order" type="number" min="0"
              value={form.sortOrder} onChange={update('sortOrder')} />
          </div>
          <Field id="location" label="Location"
            value={form.location} onChange={update('location')} />

          <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={update('isActive')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete department?"
        message={`Delete "${confirmDelete?.name}"? Sub-units and assigned employees must be reassigned first.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

/* =====================================================================
 *  Tree node
 * ===================================================================== */
function DepartmentNode({ node, depth, canManage, onEdit, onDelete, onAddChild }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;

  const rowPad = 16 + depth * 20;

  return (
    <li>
      <div
        className="group flex items-center gap-2 py-2 pr-4 transition hover:bg-slate-50/70"
        style={{ paddingLeft: `${rowPad}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className={`flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 ${
            !hasChildren ? 'invisible' : ''
          }`}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${
          node.officeType === 'department' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
        }`}>
          <Building2 className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-sm font-medium ${
              node.isActive ? 'text-slate-900' : 'text-slate-400 line-through'
            }`}>
              {node.name}
            </p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">
              {node.code}
            </span>
            {!node.isActive && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                inactive
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {node.head && (
              <span className="inline-flex items-center gap-1">
                <UserCog className="h-3 w-3" />
                Head: {node.head.fullName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {node.totalEmployees ?? node.employeeCount} employee{(node.totalEmployees ?? node.employeeCount) === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" onClick={() => onAddChild(node.id)} aria-label="Add sub-unit"
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onEdit(node)} aria-label="Edit"
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onDelete(node)} aria-label="Delete"
              className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <DepartmentNode
              key={child.id} node={child} depth={depth + 1}
              canManage={canManage} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* primitives */
function Field({ id, label, required, error, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SelectField({ id, label, options, ...rest }) {
  const norm = options.map((o) => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <select id={id}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        {...rest}>
        {norm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}