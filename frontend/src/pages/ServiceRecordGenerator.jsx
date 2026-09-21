import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Loader2, Download, Search, Info, ChevronRight,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';
import { downloadServiceRecordPdf } from '../utils/documentPdf.js';

const AGENCY_STORAGE_KEY = 'hrmis.servicerecord.agency';

export default function ServiceRecordGenerator() {
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [agencyName, setAgencyName] = useState('Republic of the Philippines');
  const [agencySubheader, setAgencySubheader] = useState('');
  const [preparedByName, setPreparedByName] = useState('');
  const [preparedByTitle, setPreparedByTitle] = useState('Human Resource Management Officer');
  const [approvedByName, setApprovedByName] = useState('');
  const [approvedByTitle, setApprovedByTitle] = useState('Authorized Official');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AGENCY_STORAGE_KEY) ?? 'null');
      if (saved) {
        if (saved.agencyName) setAgencyName(saved.agencyName);
        if (saved.agencySubheader) setAgencySubheader(saved.agencySubheader);
        if (saved.preparedByName) setPreparedByName(saved.preparedByName);
        if (saved.preparedByTitle) setPreparedByTitle(saved.preparedByTitle);
        if (saved.approvedByName) setApprovedByName(saved.approvedByName);
        if (saved.approvedByTitle) setApprovedByTitle(saved.approvedByTitle);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/employees?limit=500&activeOnly=true');
        setEmployees(data.data.employees ?? []);
      } catch (err) {
        setError(extractApiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When an employee is selected, fetch the preview (records count etc.)
  useEffect(() => {
    if (!employeeId) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const { data } = await api.post('/reports/2/run', {
          filters: { employeeId: Number(employeeId) },
        });
        if (cancelled) return;
        setPreview(data.data.document);
      } catch (err) {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  function persistAgency() {
    try {
      localStorage.setItem(AGENCY_STORAGE_KEY, JSON.stringify({
        agencyName, agencySubheader,
        preparedByName, preparedByTitle,
        approvedByName, approvedByTitle,
      }));
    } catch { /* ignore */ }
  }

  async function handleGenerate() {
    if (!employeeId) { setError('Select an employee first.'); return; }
    if (!preview) { setError('No service record data available for this employee.'); return; }

    persistAgency();
    setGenerating(true);
    setError(null);

    try {
      downloadServiceRecordPdf({
        agency: {
          name: agencyName,
          subheader: agencySubheader || null,
        },
        employee: preview.employee,
        records: preview.records,
        signatories: {
          preparedBy: {
            name: preparedByName || '__________________________',
            title: preparedByTitle,
          },
          approvedBy: {
            name: approvedByName || '__________________________',
            title: approvedByTitle,
          },
        },
      });
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setGenerating(false);
    }
  }

  const selected = employees.find((e) => String(e.id) === String(employeeId));
  const filtered = employees.filter((e) =>
    !employeeSearch ||
    e.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    e.employeeNumber.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link to="/reports" className="hover:text-brand-600">Reports</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">Service Record</span>
      </nav>

      <header className="mt-4 flex items-start gap-3 border-b border-slate-200 pb-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Service Record Export
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            CSC Form No. 2 — full appointment history for a single employee, rendered as a printable PDF.
          </p>
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Employee picker */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Employee
            </h2>

            <div className="mt-3 relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search employee…"
                className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              size={6}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-1 text-sm outline-none focus:border-brand-500"
            >
              {filtered.map((e) => (
                <option key={e.id} value={e.id} className="rounded px-2 py-1">
                  {e.fullName} ({e.employeeNumber})
                </option>
              ))}
            </select>
          </section>

          {/* Preview */}
          {employeeId && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Preview
              </h2>

              {previewLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                </div>
              ) : preview ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{preview.employee.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {preview.employee.employeeNumber} · {preview.employee.departmentName ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {preview.employee.currentPosition ?? '—'}
                    </p>
                  </div>

                  <p className="text-xs font-medium text-slate-700">
                    {preview.records.length} record{preview.records.length === 1 ? '' : 's'} in service history
                  </p>

                  <ul className="space-y-1.5">
                    {preview.records.slice(0, 5).map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                        <span>
                          <strong>{r.recordType}</strong> · {r.positionTitle}
                          <br />
                          <span className="text-slate-400">
                            {r.fromDate} → {r.isPresent ? 'Present' : r.toDate ?? '—'}
                          </span>
                        </span>
                      </li>
                    ))}
                    {preview.records.length > 5 && (
                      <li className="text-xs italic text-slate-500">
                        + {preview.records.length - 5} more record(s)
                      </li>
                    )}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  No service records found for this employee.
                </p>
              )}
            </section>
          )}

          {/* Agency header */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Agency header
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="an" className="block text-sm font-medium text-slate-700">
                  Agency name
                </label>
                <input
                  id="an"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label htmlFor="as" className="block text-sm font-medium text-slate-700">
                  Subheader
                </label>
                <input
                  id="as"
                  value={agencySubheader}
                  onChange={(e) => setAgencySubheader(e.target.value)}
                  placeholder="e.g. City Government of ___________"
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          </section>

          {/* Signatories */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Signatories
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Prepared by</p>
                <input
                  type="text"
                  value={preparedByName}
                  onChange={(e) => setPreparedByName(e.target.value)}
                  placeholder="Full name"
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <input
                  type="text"
                  value={preparedByTitle}
                  onChange={(e) => setPreparedByTitle(e.target.value)}
                  placeholder="Position / title"
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Certified correct</p>
                <input
                  type="text"
                  value={approvedByName}
                  onChange={(e) => setApprovedByName(e.target.value)}
                  placeholder="Full name"
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <input
                  type="text"
                  value={approvedByTitle}
                  onChange={(e) => setApprovedByTitle(e.target.value)}
                  placeholder="Position / title"
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Action column */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-700" />
                <h3 className="text-sm font-semibold text-brand-900">Generate Service Record</h3>
              </div>
              <p className="mt-2 text-xs text-brand-800">
                Landscape A4, print-ready. Renders the full appointment history with CSC-style
                columns.
              </p>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!employeeId || generating || previewLoading || !preview}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {generating ? 'Generating…' : 'Download Service Record'}
              </button>

              {selected && preview && (
                <p className="mt-3 text-center text-[11px] text-brand-700">
                  {preview.records.length} record(s) for {selected.fullName}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-xs text-slate-600">
                  Records are ordered by sequence number. Add or edit records from the employee's
                  detail page under the <strong>Service Record</strong> tab.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}