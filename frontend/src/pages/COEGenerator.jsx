import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, Loader2, Download, Search, FileCheck, Info,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';
import { downloadCOEPdf } from '../utils/documentPdf.js';

const AGENCY_STORAGE_KEY = 'hrmis.coe.agency';

export default function COEGenerator() {
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [showSalary, setShowSalary] = useState(true);
  const [agencyName, setAgencyName] = useState('Republic of the Philippines');
  const [agencySubheader, setAgencySubheader] = useState('');
  const [preparedByName, setPreparedByName] = useState('');
  const [preparedByTitle, setPreparedByTitle] = useState('Human Resource Management Officer');
  const [approvedByName, setApprovedByName] = useState('');
  const [approvedByTitle, setApprovedByTitle] = useState('Authorized Official');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  /* Restore agency defaults from localStorage */
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

  /* Load employees */
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

  function persistAgencyDefaults() {
    try {
      localStorage.setItem(AGENCY_STORAGE_KEY, JSON.stringify({
        agencyName, agencySubheader,
        preparedByName, preparedByTitle,
        approvedByName, approvedByTitle,
      }));
    } catch { /* ignore quota errors */ }
  }

  async function handleGenerate() {
    if (!employeeId) {
      setError('Select an employee first.');
      return;
    }

    persistAgencyDefaults();
    setGenerating(true);
    setError(null);

    try {
      // Fetch the COE payload from the report handler
      const { data } = await api.post('/reports/3/run', {
        filters: {
          employeeId: Number(employeeId),
          showSalary,
          purpose: purpose.trim() || null,
          agencyName: agencyName.trim(),
          agencySubheader: agencySubheader.trim() || null,
        },
      });

      const doc = data.data.document;
      if (!doc) {
        throw new Error('Report did not return a document payload.');
      }

      downloadCOEPdf({
        agency: {
          name: doc.agency?.name ?? agencyName,
          subheader: doc.agency?.subheader ?? agencySubheader ?? null,
        },
        employee: doc.employee,
        purpose: doc.purpose,
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
      const e = extractApiError(err);
      setError(e.message);
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
        <span className="text-slate-700">Certificate of Employment</span>
      </nav>

      <header className="mt-4 flex items-start gap-3 border-b border-slate-200 pb-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Award className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Certificate of Employment
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate a printable COE for any active employee. Output is a PDF you can download and print.
          </p>
        </div>
      </header>

      {error && <div className="mt-6"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Form column */}
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

            {selected && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p><strong>{selected.fullName}</strong></p>
                <p>{selected.positionTitle ?? '—'} · {selected.departmentName ?? '—'}</p>
                <p>Hired: {selected.dateHired ?? '—'} · Status: {selected.employmentStatus}</p>
              </div>
            )}
          </section>

          {/* Purpose & options */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Certification details
            </h2>

            <div className="mt-3 space-y-4">
              <div>
                <label htmlFor="purpose" className="block text-sm font-medium text-slate-700">
                  Purpose (optional)
                </label>
                <input
                  id="purpose"
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Bank loan application, Visa application, Employment verification"
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showSalary}
                  onChange={(e) => setShowSalary(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Include monthly salary
              </label>
            </div>
          </section>

          {/* Agency header */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Agency header
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="agencyName" className="block text-sm font-medium text-slate-700">
                  Agency name
                </label>
                <input
                  id="agencyName"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label htmlFor="agencySub" className="block text-sm font-medium text-slate-700">
                  Subheader (office / city)
                </label>
                <input
                  id="agencySub"
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
                <p className="text-xs font-medium text-slate-500 mb-2">Approved by</p>
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

        {/* Preview / actions column */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-brand-700" />
                <h3 className="text-sm font-semibold text-brand-900">Generate PDF</h3>
              </div>
              <p className="mt-2 text-xs text-brand-800">
                The PDF opens in a new browser tab and downloads automatically.
                Open it and print on letter-size paper.
              </p>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!employeeId || generating || loading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {generating ? 'Generating…' : 'Download Certificate of Employment'}
              </button>

              {selected && (
                <p className="mt-3 text-center text-[11px] text-brand-700">
                  For {selected.fullName}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="text-xs text-slate-600 space-y-2">
                  <p>
                    <strong>Tip:</strong> Agency name and signatories are saved to your browser so you
                    don't retype them every time.
                  </p>
                  <p>
                    Every COE generation is logged in the audit trail — who ran it, for whom, and when.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}