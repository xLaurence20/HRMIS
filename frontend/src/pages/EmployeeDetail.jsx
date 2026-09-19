import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Plus, Loader2, User,
  Briefcase, GraduationCap, Award, BookOpen, Users2,
  Mail, Phone, MapPin, IdCard, Calendar, Link2, Link2Off,
} from 'lucide-react';
import { api, extractApiError } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ServiceRecordFormModal from '../components/ServiceRecordFormModal';

const TABS = [
  { id: 'profile',     label: 'Profile',      Icon: User },
  { id: 'service',     label: 'Service Record', Icon: Briefcase },
  { id: 'education',   label: 'Education',    Icon: GraduationCap },
  { id: 'eligibility', label: 'Eligibility',  Icon: Award },
  { id: 'trainings',   label: 'Trainings',    Icon: BookOpen },
  { id: 'dependents',  label: 'Dependents',   Icon: Users2 },
];

const fmt = (v) => v ?? '—';

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [tab, setTab] = useState('profile');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editService, setEditService] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get(`/employees/${id}`);
      setData(res.data);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/employees/${id}`);
      navigate('/employees', { replace: true });
    } catch (err) {
      setError(extractApiError(err).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleUnlink() {
    try {
      await api.delete(`/employees/${id}/link-user`);
      load();
    } catch (err) {
      setError(extractApiError(err).message);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Alert variant="error" title="Could not load employee">{error}</Alert>
        <Link to="/employees" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to directory
        </Link>
      </div>
    );
  }

  const { employee, serviceRecords, education, eligibility, trainings, dependents } = data;
  const canEdit = hasPermission('employees.update');
  const canDelete = hasPermission('employees.delete');
  const canManageSR = hasPermission('service_records.create');

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500">
        <Link to="/employees" className="hover:text-brand-600">Employees</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{employee.fullName}</span>
      </nav>

      {/* Header */}
      <header className="mt-4 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          {employee.photoPath ? (
            <img src={employee.photoPath} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700 ring-2 ring-white shadow">
              {(employee.firstName?.[0] ?? '') + (employee.lastName?.[0] ?? '')}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {employee.fullName}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {employee.employeeNumber}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {employee.positionTitle && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                  {employee.positionTitle}
                </span>
              )}
              {employee.departmentName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {employee.departmentName}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                {employee.employmentStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/employees"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          {canEdit && (
            <Link
              to={`/employees/${employee.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Archive
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Employee sections">
        {TABS.map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            aria-current={tab === tabId ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === tabId
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tabId === 'service' && serviceRecords.length > 0 && (
              <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
                {serviceRecords.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="mt-6 animate-fade-in">
        {tab === 'profile' && (
          <ProfileTab employee={employee} onUnlink={handleUnlink} canLink={hasPermission('users.assign_roles')} />
        )}

        {tab === 'service' && (
          <ServiceRecordTab
            records={serviceRecords}
            canManage={canManageSR}
            onCreate={() => { setEditService(null); setServiceFormOpen(true); }}
            onEdit={(r) => { setEditService(r); setServiceFormOpen(true); }}
            onChanged={load}
          />
        )}

        {tab === 'education' && (
          <SimpleList
            items={education}
            emptyTitle="No education records"
            emptyDescription="Education history is added via the employee record."
            columns={[
              { header: 'Level', render: (r) => r.level },
              { header: 'School', render: (r) => r.schoolName },
              { header: 'Course', render: (r) => r.degreeCourse ?? '—' },
              { header: 'Year', render: (r) => r.yearGraduated ?? '—' },
              { header: 'Honors', render: (r) => r.honors ?? '—' },
            ]}
          />
        )}

        {tab === 'eligibility' && (
          <SimpleList
            items={eligibility}
            emptyTitle="No eligibility records"
            emptyDescription="Civil Service eligibility and licenses appear here."
            columns={[
              { header: 'Eligibility', render: (r) => r.eligibilityName },
              { header: 'Rating', render: (r) => r.rating ?? '—' },
              { header: 'Date Taken', render: (r) => r.dateTaken ?? '—' },
              { header: 'License No.', render: (r) => r.licenseNo ?? '—' },
              { header: 'Valid Until', render: (r) => r.licenseValidUntil ?? '—' },
            ]}
          />
        )}

        {tab === 'trainings' && (
          <SimpleList
            items={trainings}
            emptyTitle="No training records"
            emptyDescription="Learning and development history appears here."
            columns={[
              { header: 'Title', render: (r) => r.title },
              { header: 'Conducted By', render: (r) => r.conductedBy ?? '—' },
              { header: 'Level', render: (r) => r.level ?? '—' },
              { header: 'From', render: (r) => r.dateFrom ?? '—' },
              { header: 'To', render: (r) => r.dateTo ?? '—' },
              { header: 'Hours', render: (r) => r.hours ?? '—' },
            ]}
          />
        )}

        {tab === 'dependents' && (
          <SimpleList
            items={dependents}
            emptyTitle="No dependents on file"
            emptyDescription="Dependents and beneficiaries appear here."
            columns={[
              { header: 'Name', render: (r) => r.fullName },
              { header: 'Relationship', render: (r) => r.relationship },
              { header: 'Birth Date', render: (r) => r.birthDate ?? '—' },
              { header: 'Beneficiary', render: (r) => (r.isBeneficiary ? 'Yes' : '—') },
            ]}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Archive employee record?"
        message={`This will archive ${employee.fullName}. The record will no longer appear in the directory, but will remain in the database for historical reporting (DTR, leave, and audit trail). This action can be reversed only by an administrator with direct database access.`}
        confirmLabel="Archive"
      />

      <ServiceRecordFormModal
        open={serviceFormOpen}
        onClose={() => setServiceFormOpen(false)}
        employeeId={employee.id}
        record={editService}
        onSaved={() => { setServiceFormOpen(false); load(); }}
      />
    </div>
  );
}

/* =====================================================================
 *  Profile tab
 * ===================================================================== */
function ProfileTab({ employee, onUnlink, canLink }) {
  const sections = [
    {
      title: 'Personal information',
      icon: User,
      rows: [
        ['First name', employee.firstName],
        ['Middle name', employee.middleName],
        ['Last name', employee.lastName],
        ['Extension', employee.nameExtension],
        ['Gender', employee.gender],
        ['Birth date', employee.birthDate],
        ['Birth place', employee.birthPlace],
        ['Civil status', employee.civilStatus],
        ['Citizenship', employee.citizenship],
        ['Religion', employee.religion],
        ['Blood type', employee.bloodType],
        ['Height (cm)', employee.heightCm],
        ['Weight (kg)', employee.weightKg],
      ],
    },
    {
      title: 'Contact',
      icon: Phone,
      rows: [
        ['Mobile', employee.mobileNo],
        ['Telephone', employee.telephoneNo],
        ['Personal email', employee.personalEmail],
      ],
    },
    {
      title: 'Address',
      icon: MapPin,
      rows: [
        ['House / Unit', employee.address?.houseNo],
        ['Street', employee.address?.street],
        ['Barangay', employee.address?.barangay],
        ['City / Municipality', employee.address?.cityMunicipality],
        ['Province', employee.address?.province],
        ['Region', employee.address?.region],
        ['ZIP code', employee.address?.zipCode],
      ],
    },
    {
      title: 'Government IDs',
      icon: IdCard,
      rows: [
        ['GSIS No.', employee.gsisNo],
        ['Pag-IBIG No.', employee.pagibigNo],
        ['PhilHealth No.', employee.philhealthNo],
        ['SSS No.', employee.sssNo],
        ['TIN', employee.tin],
        ['Agency Employee No.', employee.agencyEmployeeNo],
      ],
    },
    {
      title: 'Employment',
      icon: Briefcase,
      rows: [
        ['Employment status', employee.employmentStatus],
        ['Date hired', employee.dateHired],
        ['Date regularized', employee.dateRegularized],
        ['Salary grade', employee.salaryGrade],
        ['Step increment', employee.stepIncrement],
        ['Monthly salary', employee.monthlySalary != null
          ? `₱${employee.monthlySalary.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
          : null],
        ['Supervisor', employee.supervisorName],
        ['Years in service', employee.yearsInService != null ? `${employee.yearsInService} years` : null],
        ['Age', employee.age != null ? `${employee.age} years` : null],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Account link */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Portal account
        </h3>
        {employee.userId ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Link2 className="h-4 w-4" />
              <span>Linked to <strong>{employee.username}</strong></span>
            </div>
            {canLink && (
              <button
                type="button"
                onClick={onUnlink}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <Link2Off className="h-3.5 w-3.5" />
                Unlink
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No portal account linked. Link from the Users module once an account is created.
          </p>
        )}
      </section>

      {sections.map((section) => (
        <section
          key={section.title}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <section.icon className="h-4 w-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {section.title}
            </h3>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-sm text-slate-800">{fmt(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* =====================================================================
 *  Service Record tab
 * ===================================================================== */
function ServiceRecordTab({ records, canManage, onCreate, onEdit, onChanged }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/service-records/${confirmDelete.id}`);
      setConfirmDelete(null);
      onChanged();
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Chronological record of appointments, promotions, and status changes.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add record
          </button>
        )}
      </div>

      {error && <div className="mt-4"><Alert variant="error" onClose={() => setError(null)}>{error}</Alert></div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {records.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">No service records</p>
            <p className="mt-1 text-xs text-slate-500">
              Add the original appointment to start the personnel history.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map((r) => (
              <li key={r.id} className="px-5 py-4 transition hover:bg-slate-50/50">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {r.sequenceNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {r.positionTitle}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {r.recordType}
                      </span>
                      {r.isPresent && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.departmentName ?? '—'}
                      {r.salaryGrade != null && ` · SG-${r.salaryGrade}`}
                      {r.stepIncrement != null && ` / Step ${r.stepIncrement}`}
                      {r.monthlySalary != null && ` · ₱${r.monthlySalary.toLocaleString('en-PH')}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.fromDate} → {r.isPresent ? 'present' : (r.toDate ?? '—')}
                      {r.appointmentType && ` · ${r.appointmentType}`}
                    </p>
                    {r.legalBasis && (
                      <p className="mt-1 text-xs italic text-slate-400">{r.legalBasis}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        aria-label="Edit"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(r)}
                        aria-label="Delete"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete service record?"
        message={`The "${confirmDelete?.recordType}" entry from ${confirmDelete?.fromDate} will be removed from this employee's service history.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

/* =====================================================================
 *  Simple table for the read-only tabs
 * ===================================================================== */
function SimpleList({ items, columns, emptyTitle, emptyDescription }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-500">{emptyDescription}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.header}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r, i) => (
              <tr key={r.id ?? i} className="hover:bg-slate-50/60">
                {columns.map((c) => (
                  <td key={c.header} className="px-4 py-3 text-slate-700">
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}