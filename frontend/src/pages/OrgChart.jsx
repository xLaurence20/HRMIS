import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Loader2, RefreshCw, ChevronRight, ChevronDown,
  Building2, UserCog, Users, Network,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';

export default function OrgChart() {
  const [tree, setTree] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/org/tree');
      setTree(data.data.tree ?? []);
      setTotals(data.data.totals ?? null);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter: if searching, keep only nodes that match or have matching descendants.
  const filteredTree = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    const walk = (node) => {
      const selfMatch =
        node.name.toLowerCase().includes(q) ||
        node.code.toLowerCase().includes(q) ||
        (node.head?.fullName ?? '').toLowerCase().includes(q) ||
        node.employees.some((e) => e.fullName.toLowerCase().includes(q));
      const kids = node.children.map(walk).filter(Boolean);
      if (selfMatch || kids.length) {
        return { ...node, children: kids, __matched: selfMatch };
      }
      return null;
    };
    return tree.map(walk).filter(Boolean);
  }, [tree, query]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Network className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Organizational Chart
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Hierarchical view of departments, unit heads, and personnel.
          </p>
          {totals && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span><strong className="text-slate-700">{totals.departments}</strong> departments</span>
              <span><strong className="text-slate-700">{totals.employees}</strong> employees</span>
              <span><strong className="text-slate-700">{totals.activeDepartments}</strong> active</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error">{error}</Alert></div>}

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="mt-8">
          <EmptyState Icon={Network} title="No departments" description="Add departments to see the organizational chart." />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filteredTree.map((node) => (
            <OrgNode key={node.id} node={node} depth={0} defaultOpen />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgNode({ node, depth, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children?.length > 0;

  return (
    <div>
      <div
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <button type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 ${
              !hasChildren ? 'invisible' : ''
            }`}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            depth === 0 ? 'bg-brand-600 text-white'
                        : 'bg-brand-50 text-brand-700'
          }`}>
            <Building2 className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{node.name}</h3>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">
                {node.code}
              </span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                {node.officeType}
              </span>
              {!node.isActive && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  inactive
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {node.head ? (
                <span className="inline-flex items-center gap-1">
                  <UserCog className="h-3.5 w-3.5 text-slate-400" />
                  Head: <span className="font-medium text-slate-700">{node.head.fullName}</span>
                  {node.head.positionTitle && (
                    <span className="text-slate-400">({node.head.positionTitle})</span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <UserCog className="h-3.5 w-3.5" /> No head assigned
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {node.employeeCount} direct · {node.totalEmployees} total
              </span>
            </div>

            {open && node.employees.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {node.employees.map((e) => (
                  <span key={e.id}
                    title={e.positionTitle ?? ''}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                    {e.fullName}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && hasChildren && (
        <div className="mt-3 space-y-3">
          {node.children.map((c) => (
            <OrgNode key={c.id} node={c} depth={depth + 1} defaultOpen={false} />
          ))}
        </div>
      )}
    </div>
  );
}