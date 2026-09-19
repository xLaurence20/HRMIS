import { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Modal from './ui/Modal';
import Alert from './ui/Alert';

const RECORD_TYPES = [
  'Original Appointment','Promotion','Step Increment','Transfer','Reassignment',
  'Detail','Designation','Salary Adjustment','Reinstatement','Contract Renewal',
  'Separation','Retirement','Resignation','Drop from Rolls','Others',
];
const APPOINTMENT_TYPES = [
  'Permanent','Temporary','Coterminous','Casual','Contractual',
  'Job Order','Contract of Service','Substitute','Provisional','Emergency',
];

const EMPTY = {
  sequenceNo: '',
  recordType: 'Original Appointment',
  fromDate: '', toDate: '', isPresent: false,
  positionTitle: '', positionId: '', departmentId: '', departmentName: '',
  agency: '', salaryGrade: '', stepIncrement: '', monthlySalary: '',
  appointmentType: 'Permanent', appointmentStatus: 'Active',
  leaveWithoutPay: false, legalBasis: '', documentRef: '', remarks: '',
};

export default function ServiceRecordFormModal({ open, onClose, employeeId, record, onSaved }) {
  const isEdit = Boolean(record?.id);

  const [form, setForm] = useState(EMPTY);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /* Load lookups when modal opens */
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [d, p] = await Promise.all([
          api.get('/departments'),
          api.get('/positions?activeOnly=true&limit=500'),
        ]);
        setDepartments(d.data.data.departments ?? []);
        setPositions(p.data.data.positions ?? []);
      } catch { /* non-fatal */ }
    })();
  }, [open]);

  /* Populate for edit */
  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({
        sequenceNo: record.sequenceNo ?? '',
        recordType: record.recordType ?? 'Original Appointment',
        fromDate: record.fromDate ?? '',
        toDate: record.toDate ?? '',
        isPresent: Boolean(record.isPresent),
        positionTitle: record.positionTitle ?? '',
        positionId: record.positionId ? String(record.positionId) : '',
        departmentId: record.departmentId ? String(record.departmentId) : '',
        departmentName: record.departmentName ?? '',
        agency: record.agency ?? '',
        salaryGrade: record.salaryGrade ?? '',
        stepIncrement: record.stepIncrement ?? '',
        monthlySalary: record.monthlySalary ?? '',
        appointmentType: record.appointmentType ?? 'Permanent',
        appointmentStatus: record.appointmentStatus ?? 'Active',
        leaveWithoutPay: Boolean(record.leaveWithoutPay),
        legalBasis: record.legalBasis ?? '',
        documentRef: record.documentRef ?? '',
        remarks: record.remarks ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setFieldErrors({});
    setError(null);
  }, [open, record]);

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-fill title when a position is chosen
      if (key === 'positionId' && value) {
        const p = positions.find((pp) => String(pp.id) === String(value));
        if (p) {
          next.positionTitle = p.title;
          if (p.salaryGrade != null && !f.salaryGrade) next.salaryGrade = p.salaryGrade;
          if (p.monthlyRate != null && !f.monthlySalary) next.monthlySalary = p.monthlyRate;
        }
      }
      // Auto-fill department name when a department is chosen
      if (key === 'departmentId' && value) {
        const d = departments.find((dd) => String(dd.id) === String(value));
        if (d) next.departmentName = d.name;
      }
      // isPresent forces toDate blank
      if (key === 'isPresent' && value) next.toDate = '';
      return next;
    });
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setError(null);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const errors = {};
    if (!form.recordType) errors.recordType = 'Required.';
    if (!form.fromDate) errors.fromDate = 'Required.';
    if (!form.positionTitle.trim()) errors.positionTitle = 'Required.';
    if (!form.isPresent && form.toDate && form.toDate < form.fromDate) {
      errors.toDate = 'End date must be after start date.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    // Coerce
    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === 'boolean') { payload[k] = v; continue; }
      if (v === '' || v === null || v === undefined) continue;
      if (['salaryGrade','stepIncrement'].includes(k)) payload[k] = Number(v);
      else if (k === 'monthlySalary') payload[k] = Number(v);
      else if (['departmentId','positionId','sequenceNo'].includes(k)) payload[k] = Number(v);
      else payload[k] = typeof v === 'string' ? v.trim() : v;
    }
    // toDate is nullable — send null explicitly when blank
    if (!payload.toDate) payload.toDate = null;

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/service-records/${record.id}`, payload);
      } else {
        await api.post(`/employees/${employeeId}/service-records`, payload);
      }
      onSaved?.();
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? 'Edit service record' : 'Add service record'}
      description="Appointments, promotions, and status changes. History is preserved with snapshots of the position title and department name."
      size="2xl"
      closeOnBackdrop={!saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add record')}
          </button>
        </>
      }
    >
      {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="recordType">Record type <Req /></Label>
          <select
            id="recordType" value={form.recordType} onChange={update('recordType')}
            className={inputCls(fieldErrors.recordType)}
          >
            {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {fieldErrors.recordType && <Err>{fieldErrors.recordType}</Err>}
        </div>

        <div>
          <Label htmlFor="fromDate">From date <Req /></Label>
          <input
            id="fromDate" type="date" value={form.fromDate} onChange={update('fromDate')}
            className={inputCls(fieldErrors.fromDate)}
          />
          {fieldErrors.fromDate && <Err>{fieldErrors.fromDate}</Err>}
        </div>

        <div>
          <Label htmlFor="toDate">To date</Label>
          <input
            id="toDate" type="date" value={form.toDate} onChange={update('toDate')}
            disabled={form.isPresent}
            className={inputCls(fieldErrors.toDate)}
          />
          <label className="mt-1.5 inline-flex select-none items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox" checked={form.isPresent} onChange={update('isPresent')}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Still in effect (closes previous record)
          </label>
          {fieldErrors.toDate && <Err>{fieldErrors.toDate}</Err>}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="positionTitle">Position title <Req /></Label>
          <input
            id="positionTitle" value={form.positionTitle} onChange={update('positionTitle')}
            placeholder="e.g. Administrative Officer II"
            className={inputCls(fieldErrors.positionTitle)}
          />
          {fieldErrors.positionTitle && <Err>{fieldErrors.positionTitle}</Err>}
        </div>

        <div>
          <Label htmlFor="positionId">Link to plantilla</Label>
          <select
            id="positionId" value={form.positionId} onChange={update('positionId')}
            className={inputCls()}
          >
            <option value="">— None —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.code})</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="departmentId">Department</Label>
          <select
            id="departmentId" value={form.departmentId} onChange={update('departmentId')}
            className={inputCls()}
          >
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="departmentName">Department name snapshot</Label>
          <input
            id="departmentName" value={form.departmentName} onChange={update('departmentName')}
            placeholder="Auto-filled when department is picked"
            className={inputCls()}
          />
        </div>

        <div>
          <Label htmlFor="agency">Agency</Label>
          <input id="agency" value={form.agency} onChange={update('agency')}
            className={inputCls()} />
        </div>

        <div>
          <Label htmlFor="salaryGrade">Salary grade</Label>
          <input id="salaryGrade" type="number" min="1" max="33"
            value={form.salaryGrade} onChange={update('salaryGrade')}
            className={inputCls()} />
        </div>
        <div>
          <Label htmlFor="stepIncrement">Step</Label>
          <input id="stepIncrement" type="number" min="1" max="8"
            value={form.stepIncrement} onChange={update('stepIncrement')}
            className={inputCls()} />
        </div>
        <div>
          <Label htmlFor="monthlySalary">Monthly salary</Label>
          <input id="monthlySalary" type="number" step="0.01" min="0"
            value={form.monthlySalary} onChange={update('monthlySalary')}
            className={inputCls()} />
        </div>

        <div>
          <Label htmlFor="appointmentType">Appointment type</Label>
          <select id="appointmentType" value={form.appointmentType} onChange={update('appointmentType')}
            className={inputCls()}>
            {APPOINTMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <Label htmlFor="appointmentStatus">Status</Label>
          <select id="appointmentStatus" value={form.appointmentStatus}
            onChange={update('appointmentStatus')} className={inputCls()}>
            {['Active','Inactive','Cancelled'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex items-end">
          <label className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.leaveWithoutPay}
              onChange={update('leaveWithoutPay')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            Leave without pay
          </label>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="legalBasis">Legal basis</Label>
          <input id="legalBasis" value={form.legalBasis} onChange={update('legalBasis')}
            placeholder='e.g. "Appointment dated 2024-01-15, CSC Resolution No. ..."'
            className={inputCls()} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="remarks">Remarks</Label>
          <textarea id="remarks" rows={2} value={form.remarks} onChange={update('remarks')}
            className={inputCls()} />
        </div>
      </form>
    </Modal>
  );
}

const inputCls = (error) =>
  `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
  }`;

const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">{children}</label>
);
const Req = () => <span className="ml-0.5 text-red-500">*</span>;
const Err = ({ children }) => <p className="mt-1 text-xs text-red-600">{children}</p>;