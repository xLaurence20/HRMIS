import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, User, Briefcase,
  MapPin, IdCard, Phone,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import Alert from '../components/ui/Alert';

const STATUSES = [
  'Permanent','Temporary','Coterminous','Casual','Contractual',
  'Job Order','Contract of Service','Substitute','Provisional',
  'Emergency','Separated','Retired',
];
const CIVIL = ['Single','Married','Widowed','Separated','Annulled','Other'];

const EMPTY = {
  employeeNumber: '',
  lastName: '', firstName: '', middleName: '', nameExtension: '',
  gender: 'Male', birthDate: '', birthPlace: '',
  civilStatus: '', citizenship: 'Filipino',
  bloodType: '', heightCm: '', weightKg: '', religion: '',
  mobileNo: '', telephoneNo: '', personalEmail: '',
  addrHouseNo: '', addrStreet: '', addrBarangay: '',
  addrCityMunicipality: '', addrProvince: '', addrRegion: '', addrZipCode: '',
  gsisNo: '', pagibigNo: '', philhealthNo: '', sssNo: '', tin: '', agencyEmployeeNo: '',
  departmentId: '', positionId: '', supervisorId: '',
  employmentStatus: 'Permanent', dateHired: '', dateRegularized: '',
  salaryGrade: '', stepIncrement: '', monthlySalary: '',
  isActive: true,
};

export default function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [supervisors, setSupervisors] = useState([]);

  /* Load lookups */
  useEffect(() => {
    (async () => {
      try {
        const [d, p, s] = await Promise.all([
          api.get('/departments'),
          api.get('/positions?activeOnly=true&limit=500'),
          api.get(`/employees/lookups/supervisors${id ? `?excludeId=${id}` : ''}`),
        ]);
        setDepartments(d.data.data.departments ?? []);
        setPositions(p.data.data.positions ?? []);
        setSupervisors(s.data.data.supervisors ?? []);
      } catch { /* non-fatal */ }
    })();
  }, [id]);

  /* Load existing employee when editing */
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const { data } = await api.get(`/employees/${id}`);
        const e = data.data.employee;
        setForm({
          employeeNumber: e.employeeNumber ?? '',
          lastName: e.lastName ?? '',
          firstName: e.firstName ?? '',
          middleName: e.middleName ?? '',
          nameExtension: e.nameExtension ?? '',
          gender: e.gender ?? 'Male',
          birthDate: e.birthDate ?? '',
          birthPlace: e.birthPlace ?? '',
          civilStatus: e.civilStatus ?? '',
          citizenship: e.citizenship ?? 'Filipino',
          bloodType: e.bloodType ?? '',
          heightCm: e.heightCm ?? '',
          weightKg: e.weightKg ?? '',
          religion: e.religion ?? '',
          mobileNo: e.mobileNo ?? '',
          telephoneNo: e.telephoneNo ?? '',
          personalEmail: e.personalEmail ?? '',
          addrHouseNo: e.address?.houseNo ?? '',
          addrStreet: e.address?.street ?? '',
          addrBarangay: e.address?.barangay ?? '',
          addrCityMunicipality: e.address?.cityMunicipality ?? '',
          addrProvince: e.address?.province ?? '',
          addrRegion: e.address?.region ?? '',
          addrZipCode: e.address?.zipCode ?? '',
          gsisNo: e.gsisNo ?? '',
          pagibigNo: e.pagibigNo ?? '',
          philhealthNo: e.philhealthNo ?? '',
          sssNo: e.sssNo ?? '',
          tin: e.tin ?? '',
          agencyEmployeeNo: e.agencyEmployeeNo ?? '',
          departmentId: e.departmentId ? String(e.departmentId) : '',
          positionId: e.positionId ? String(e.positionId) : '',
          supervisorId: e.supervisorId ? String(e.supervisorId) : '',
          employmentStatus: e.employmentStatus ?? 'Permanent',
          dateHired: e.dateHired ?? '',
          dateRegularized: e.dateRegularized ?? '',
          salaryGrade: e.salaryGrade ?? '',
          stepIncrement: e.stepIncrement ?? '',
          monthlySalary: e.monthlySalary ?? '',
          isActive: e.isActive,
        });
      } catch (err) {
        setServerError(extractApiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const update = useCallback((key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setServerError(null);
  }, []);

  function validate() {
    const e = {};
    if (!form.employeeNumber.trim()) e.employeeNumber = 'Required.';
    if (!form.lastName.trim()) e.lastName = 'Required.';
    if (!form.firstName.trim()) e.firstName = 'Required.';
    if (!form.birthDate) e.birthDate = 'Required.';
    if (form.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail)) {
      e.personalEmail = 'Invalid email format.';
    }
    if (form.mobileNo && !/^[0-9+()\-\s]{7,20}$/.test(form.mobileNo)) {
      e.mobileNo = 'Invalid phone format.';
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);

    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === 'boolean') { payload[k] = v; continue; }
      if (v === '' || v === null || v === undefined) {
        if (isEdit) payload[k] = null;
        continue;
      }
      if (['heightCm','weightKg','monthlySalary','salaryGrade','stepIncrement'].includes(k)) {
        payload[k] = Number(v);
        continue;
      }
      if (['departmentId','positionId','supervisorId'].includes(k)) {
        payload[k] = Number(v);
        continue;
      }
      payload[k] = typeof v === 'string' ? v.trim() : v;
    }

    setSaving(true);
    try {
      const { data } = isEdit
        ? await api.put(`/employees/${id}`, payload)
        : await api.post('/employees', payload);
      navigate(`/employees/${data.data.employee.id}`);
    } catch (err) {
      const { message, details } = extractApiError(err);
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      }
      setServerError(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  const visiblePositions = form.departmentId
    ? positions.filter((p) => !p.departmentId || String(p.departmentId) === String(form.departmentId))
    : positions;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link to="/employees" className="hover:text-brand-600">Employees</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{isEdit ? 'Edit' : 'New'}</span>
      </nav>

      <header className="mt-4 border-b border-slate-200 pb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {isEdit ? 'Edit employee' : 'New employee record'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {isEdit
            ? 'Update personnel information. All changes are logged.'
            : 'Create a personnel record. A portal account can be linked later.'}
        </p>
      </header>

      {serverError && (
        <div className="mt-6">
          <Alert variant="error" title="Could not save">{serverError}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-8">
        <Section title="Identity" Icon={User}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="employeeNumber" label="Employee number" required
              value={form.employeeNumber} onChange={update('employeeNumber')}
              error={fieldErrors.employeeNumber} placeholder="EMP-0001" />
            <Field id="lastName" label="Last name" required
              value={form.lastName} onChange={update('lastName')}
              error={fieldErrors.lastName} />
            <Field id="firstName" label="First name" required
              value={form.firstName} onChange={update('firstName')}
              error={fieldErrors.firstName} />
            <Field id="middleName" label="Middle name"
              value={form.middleName} onChange={update('middleName')} />
            <Field id="nameExtension" label="Extension"
              value={form.nameExtension} onChange={update('nameExtension')}
              placeholder="Jr., Sr., III" />
            <SelectField id="gender" label="Gender" required
              value={form.gender} onChange={update('gender')}
              options={['Male','Female']} />
            <Field id="birthDate" label="Birth date" type="date" required
              value={form.birthDate} onChange={update('birthDate')}
              error={fieldErrors.birthDate} />
            <Field id="birthPlace" label="Birth place"
              value={form.birthPlace} onChange={update('birthPlace')} />
            <SelectField id="civilStatus" label="Civil status"
              value={form.civilStatus} onChange={update('civilStatus')}
              options={CIVIL} placeholder="— Select —" />
            <Field id="citizenship" label="Citizenship"
              value={form.citizenship} onChange={update('citizenship')} />
            <Field id="bloodType" label="Blood type"
              value={form.bloodType} onChange={update('bloodType')} placeholder="O+" />
            <Field id="religion" label="Religion"
              value={form.religion} onChange={update('religion')} />
            <Field id="heightCm" label="Height (cm)" type="number" step="0.01"
              value={form.heightCm} onChange={update('heightCm')} />
            <Field id="weightKg" label="Weight (kg)" type="number" step="0.01"
              value={form.weightKg} onChange={update('weightKg')} />
          </div>
        </Section>

        <Section title="Contact" Icon={Phone}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="mobileNo" label="Mobile number"
              value={form.mobileNo} onChange={update('mobileNo')}
              error={fieldErrors.mobileNo} placeholder="+63 912 345 6789" />
            <Field id="telephoneNo" label="Telephone"
              value={form.telephoneNo} onChange={update('telephoneNo')} />
            <Field id="personalEmail" label="Personal email" type="email"
              value={form.personalEmail} onChange={update('personalEmail')}
              error={fieldErrors.personalEmail} />
          </div>
        </Section>

        <Section title="Address" Icon={MapPin}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="addrHouseNo" label="House / Unit"
              value={form.addrHouseNo} onChange={update('addrHouseNo')} />
            <Field id="addrStreet" label="Street"
              value={form.addrStreet} onChange={update('addrStreet')} />
            <Field id="addrBarangay" label="Barangay"
              value={form.addrBarangay} onChange={update('addrBarangay')} />
            <Field id="addrCityMunicipality" label="City / Municipality"
              value={form.addrCityMunicipality} onChange={update('addrCityMunicipality')} />
            <Field id="addrProvince" label="Province"
              value={form.addrProvince} onChange={update('addrProvince')} />
            <Field id="addrRegion" label="Region"
              value={form.addrRegion} onChange={update('addrRegion')} />
            <Field id="addrZipCode" label="ZIP code"
              value={form.addrZipCode} onChange={update('addrZipCode')} />
          </div>
        </Section>

        <Section title="Government IDs" Icon={IdCard}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="gsisNo" label="GSIS No."
              value={form.gsisNo} onChange={update('gsisNo')} />
            <Field id="pagibigNo" label="Pag-IBIG No."
              value={form.pagibigNo} onChange={update('pagibigNo')} />
            <Field id="philhealthNo" label="PhilHealth No."
              value={form.philhealthNo} onChange={update('philhealthNo')} />
            <Field id="sssNo" label="SSS No."
              value={form.sssNo} onChange={update('sssNo')} />
            <Field id="tin" label="TIN"
              value={form.tin} onChange={update('tin')} />
            <Field id="agencyEmployeeNo" label="Agency Employee No."
              value={form.agencyEmployeeNo} onChange={update('agencyEmployeeNo')} />
          </div>
        </Section>

        <Section title="Employment" Icon={Briefcase}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField id="departmentId" label="Department"
              value={form.departmentId}
              onChange={(e) => {
                update('departmentId')(e);
                setForm((f) => ({ ...f, positionId: '' }));
              }}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="— None —" />

            <SelectField id="positionId" label="Position"
              value={form.positionId} onChange={update('positionId')}
              options={visiblePositions.map((p) => ({
                value: p.id,
                label: `${p.title} (${p.code})`,
              }))}
              placeholder="— None —" />

            <SelectField id="supervisorId" label="Supervisor"
              value={form.supervisorId} onChange={update('supervisorId')}
              options={supervisors.map((s) => ({
                value: s.id,
                label: `${s.fullName}${s.isSupervisory ? ' ★' : ''}`,
              }))}
              placeholder="— None —" />

            <SelectField id="employmentStatus" label="Employment status" required
              value={form.employmentStatus} onChange={update('employmentStatus')}
              options={STATUSES} />

            <Field id="dateHired" label="Date hired" type="date"
              value={form.dateHired} onChange={update('dateHired')} />
            <Field id="dateRegularized" label="Date regularized" type="date"
              value={form.dateRegularized} onChange={update('dateRegularized')} />

            <Field id="salaryGrade" label="Salary grade" type="number" min="1" max="33"
              value={form.salaryGrade} onChange={update('salaryGrade')} />
            <Field id="stepIncrement" label="Step increment" type="number" min="1" max="8"
              value={form.stepIncrement} onChange={update('stepIncrement')} />
            <Field id="monthlySalary" label="Monthly salary" type="number" step="0.01" min="0"
              value={form.monthlySalary} onChange={update('monthlySalary')} />
          </div>

          <label className="mt-5 inline-flex select-none items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={update('isActive')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Active
            <span className="text-xs text-slate-500">(uncheck to hide from directory)</span>
          </label>
        </Section>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <button type="button" onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create employee')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

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

function SelectField({ id, label, required, error, options, placeholder, ...rest }) {
  const normalized = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}