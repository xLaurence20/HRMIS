import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Modal from './ui/Modal';
import Alert from './ui/Alert';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function DTRUploadModal({ open, onClose, onUploaded }) {
  const now = new Date();
  const [file, setFile] = useState(null);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  function reset() {
    setFile(null); setResult(null); setError(null); setUploading(false);
  }

  function handleFile(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File is larger than 5 MB.');
      return;
    }
    setFile(f); setError(null); setResult(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function handleUpload() {
    if (!file) { setError('Choose a CSV file first.'); return; }

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post(
        `/dtr/upload?year=${year}&month=${month}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(data.data.upload);
      onUploaded?.();
    } catch (err) {
      const { message, details } = extractApiError(err);
      setError(message + (details?.required ? ` (Required columns: ${details.required.join(', ')})` : ''));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={uploading ? () => {} : () => { reset(); onClose(); }}
      title="Upload DTR CSV"
      description="One row per day per employee. Existing days are overwritten."
      size="xl"
      closeOnBackdrop={!uploading}
      footer={
        <>
          <button type="button" onClick={() => { reset(); onClose(); }} disabled={uploading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Close
          </button>
          <button type="button" onClick={handleUpload} disabled={uploading || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      {/* Target month */}
      <div className="mb-5 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="uy" className="block text-sm font-medium text-slate-700">Year</label>
          <select id="uy" value={year} onChange={(e) => setYear(e.target.value)}
            disabled={uploading}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="um" className="block text-sm font-medium text-slate-700">Month</label>
          <select id="um" value={month} onChange={(e) => setMonth(e.target.value)}
            disabled={uploading}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? 'border-brand-500 bg-brand-50/50'
          : file ? 'border-emerald-300 bg-emerald-50/30'
          : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={uploading}
          className="hidden"
        />
        {file ? (
          <>
            <FileText className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-medium text-slate-900">{file.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {(file.size / 1024).toFixed(1)} KB · click to change
            </p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              Drop a CSV here, or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-500">Max 5 MB · .csv only</p>
          </>
        )}
      </div>

      {/* Column reference */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Expected columns
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-slate-700">
          {['employee_number', 'log_date', 'am_arrival', 'am_departure',
            'pm_arrival', 'pm_departure', 'overtime_in', 'overtime_out', 'remarks']
            .map((c) => (
              <span key={c} className={`rounded px-1.5 py-0.5 ${
                ['employee_number','log_date'].includes(c)
                  ? 'bg-red-100 text-red-700'
                  : 'bg-white ring-1 ring-slate-200'
              }`}>
                {c}
              </span>
            ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Only the two highlighted columns are required. Time columns accept <code>HH:MM</code>,
          <code>HH:MM:SS</code>, <code>8:30 AM</code>, or <code>0830</code>.
          Dates accept <code>YYYY-MM-DD</code> or <code>M/D/YYYY</code>.
        </p>
      </div>

      {/* Errors */}
      {error && (
        <div className="mt-4">
          <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 space-y-3">
          <Alert variant={result.errors.length ? 'info' : 'success'}>
            <div className="flex items-start gap-3">
              {result.errors.length
                ? <AlertCircle className="h-4 w-4 shrink-0 text-brand-600" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <div className="flex-1">
                <p className="font-medium">
                  Processed {result.rowsProcessed} rows — {result.rowsAccepted} accepted,
                  {' '}{result.rowsSkipped} skipped
                </p>
                <p className="mt-1 text-xs opacity-90">
                  {result.periodsCreated} new period(s), {result.logsInserted} log(s) inserted,
                  {' '}{result.logsUpdated} log(s) updated.
                </p>
              </div>
            </div>
          </Alert>

          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Line</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-slate-500">{e.line}</td>
                      <td className="px-3 py-1.5 text-slate-700">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}