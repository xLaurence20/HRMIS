import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

/* ================================================================== *
 *  Report Handler Registry
 *
 *  Each handler receives (filters, ctx) and returns one of:
 *
 *    { columns, rows, meta }        — for list/aggregate reports
 *    { document, meta }             — for document-type reports
 *                                     (COE, Service Record) rendered
 *                                     client-side as PDF
 *
 *  Handlers may throw AppError for validation issues.
 *  The reportController wraps everything in a try/catch and
 *  records failed runs.
 * ================================================================== */

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const requireFilter = (filters, key, human) => {
  if (!filters?.[key]) {
    throw new AppError(`${human ?? key} is required for this report.`,
      400, 'VALIDATION_ERROR', { fields: [{ field: key, message: 'Required.' }] });
  }
  return filters[key];
};

const toIntOr = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
};

const shapeEmployeeLabel = (row) => `${row.employee_number} — ${row.full_name}`;

/* ================================================================== *
 *  HR REPORTS
 * ================================================================== */

/**
 * Employee Master Directory
 * Filters: departmentId?, status?, activeOnly? (default true)
 */
async function employeesDirectory(filters = {}) {
  const where = ['e.deleted_at IS NULL'];
  const params = [];

  if (filters.activeOnly !== false) where.push('e.is_active = 1');
  if (filters.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(filters.departmentId));
  }
  if (filters.status) {
    where.push('e.employment_status = ?');
    params.push(filters.status);
  }

  const [rows] = await pool.query(
    `SELECT
       e.employee_number, e.full_name, e.gender,
       TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS age,
       e.employment_status, e.date_hired,
       TIMESTAMPDIFF(YEAR, e.date_hired, CURDATE()) AS years_service,
       e.salary_grade, e.step_increment, e.monthly_salary,
       e.mobile_no, e.personal_email,
       d.code AS department_code, d.name AS department_name,
       p.title AS position_title
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions   p ON p.id = e.position_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.name ASC, e.last_name ASC, e.first_name ASC`,
    params
  );

  return {
    columns: [
      { key: 'employee_number', header: 'Employee No.' },
      { key: 'full_name',       header: 'Full Name' },
      { key: 'department_name', header: 'Department' },
      { key: 'position_title',  header: 'Position' },
      { key: 'employment_status', header: 'Status' },
      { key: 'date_hired',      header: 'Date Hired' },
      { key: 'years_service',   header: 'Years of Service', align: 'right' },
      { key: 'salary_grade',    header: 'SG', align: 'right' },
      { key: 'step_increment',  header: 'Step', align: 'right' },
      { key: 'monthly_salary',  header: 'Monthly Salary', align: 'right',
        format: (v) => v != null ? Number(v).toFixed(2) : '' },
      { key: 'mobile_no',       header: 'Mobile' },
      { key: 'personal_email',  header: 'Email' },
    ],
    rows,
    meta: { reportKind: 'list' },
  };
}

/**
 * Service Record Export — data only. Frontend renders the PDF.
 * Filter: employeeId (required)
 */
async function documentsServiceRecord(filters = {}) {
  const employeeId = requireFilter(filters, 'employeeId', 'Employee');
  const empId = Number(employeeId);
  if (!Number.isInteger(empId) || empId <= 0) {
    throw new AppError('Invalid employeeId.', 400, 'VALIDATION_ERROR');
  }

  const [[employee]] = await pool.query(
    `SELECT
       e.id, e.employee_number, e.full_name, e.first_name, e.middle_name,
       e.last_name, e.name_extension, e.birth_date, e.gender,
       e.civil_status, e.citizenship,
       e.date_hired, e.employment_status, e.salary_grade, e.step_increment,
       e.monthly_salary,
       d.code AS department_code, d.name AS department_name,
       p.title AS position_title
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions   p ON p.id = e.position_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [empId]
  );
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const [records] = await pool.query(
    `SELECT
       sr.sequence_no, sr.record_type, sr.from_date, sr.to_date, sr.is_present,
       sr.position_title, sr.department_name, sr.agency,
       sr.salary_grade, sr.step_increment, sr.monthly_salary,
       sr.appointment_type, sr.appointment_status, sr.leave_without_pay,
       sr.legal_basis, sr.remarks
     FROM service_records sr
     WHERE sr.employee_id = ? AND sr.deleted_at IS NULL
     ORDER BY sr.sequence_no ASC, sr.from_date DESC`,
    [empId]
  );

  return {
    document: {
      type: 'serviceRecord',
      generatedAt: new Date().toISOString(),
      employee: {
        employeeNumber: employee.employee_number,
        fullName: employee.full_name,
        firstName: employee.first_name,
        middleName: employee.middle_name,
        lastName: employee.last_name,
        extension: employee.name_extension,
        birthDate: employee.birth_date,
        gender: employee.gender,
        civilStatus: employee.civil_status,
        citizenship: employee.citizenship,
        departmentCode: employee.department_code,
        departmentName: employee.department_name,
        currentPosition: employee.position_title,
        currentSalaryGrade: employee.salary_grade,
        currentStep: employee.step_increment,
        currentSalary: employee.monthly_salary,
        dateHired: employee.date_hired,
        employmentStatus: employee.employment_status,
      },
      records: records.map((r) => ({
        sequence: r.sequence_no,
        recordType: r.record_type,
        fromDate: r.from_date,
        toDate: r.to_date,
        isPresent: Boolean(r.is_present),
        positionTitle: r.position_title,
        departmentName: r.department_name,
        agency: r.agency,
        salaryGrade: r.salary_grade,
        stepIncrement: r.step_increment,
        monthlySalary: r.monthly_salary != null ? Number(r.monthly_salary) : null,
        appointmentType: r.appointment_type,
        appointmentStatus: r.appointment_status,
        leaveWithoutPay: Boolean(r.leave_without_pay),
        legalBasis: r.legal_basis,
        remarks: r.remarks,
      })),
    },
    meta: { reportKind: 'document', recordCount: records.length },
  };
}

/**
 * Certificate of Employment — data only. Frontend renders the PDF.
 * Filters: employeeId (required), showSalary?, purpose?
 */
async function documentsCOE(filters = {}) {
  const employeeId = requireFilter(filters, 'employeeId', 'Employee');
  const empId = Number(employeeId);

  const [[employee]] = await pool.query(
    `SELECT
       e.id, e.employee_number, e.full_name, e.first_name, e.middle_name,
       e.last_name, e.name_extension, e.employment_status,
       e.date_hired, e.date_regularized, e.salary_grade, e.step_increment,
       e.monthly_salary,
       d.name AS department_name, p.title AS position_title
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions   p ON p.id = e.position_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [empId]
  );
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const showSalary = filters.showSalary !== false && filters.showSalary !== 'false';

  // Optional: allow the caller to pass agency header info.
  // Fallback to a generic placeholder that the frontend can override.
  const agencyName = filters.agencyName ?? 'Republic of the Philippines';
  const agencySubheader = filters.agencySubheader ?? null;

  return {
    document: {
      type: 'coe',
      generatedAt: new Date().toISOString(),
      agency: {
        name: agencyName,
        subheader: agencySubheader,
      },
      employee: {
        employeeNumber: employee.employee_number,
        fullName: employee.full_name,
        firstName: employee.first_name,
        middleName: employee.middle_name,
        lastName: employee.last_name,
        extension: employee.name_extension,
        departmentName: employee.department_name,
        positionTitle: employee.position_title,
        employmentStatus: employee.employment_status,
        dateHired: employee.date_hired,
        dateRegularized: employee.date_regularized,
        salaryGrade: employee.salary_grade,
        stepIncrement: employee.step_increment,
        monthlySalary: showSalary && employee.monthly_salary != null
          ? Number(employee.monthly_salary)
          : null,
      },
      purpose: filters.purpose ?? null,
    },
    meta: { reportKind: 'document' },
  };
}

/* ================================================================== *
 *  ORGANIZATION REPORTS
 * ================================================================== */

async function orgHeadcountByDepartment() {
  const [rows] = await pool.query(
    `SELECT
       d.code AS department_code,
       d.name AS department_name,
       d.office_type,
       COUNT(e.id) AS total_active,
       SUM(CASE WHEN e.employment_status = 'Permanent' THEN 1 ELSE 0 END) AS permanent,
       SUM(CASE WHEN e.employment_status = 'Temporary' THEN 1 ELSE 0 END) AS temporary,
       SUM(CASE WHEN e.employment_status = 'Coterminous' THEN 1 ELSE 0 END) AS coterminous,
       SUM(CASE WHEN e.employment_status = 'Casual' THEN 1 ELSE 0 END) AS casual,
       SUM(CASE WHEN e.employment_status NOT IN
         ('Permanent','Temporary','Coterminous','Casual','Separated','Retired')
         AND e.is_active = 1 THEN 1 ELSE 0 END) AS other
     FROM departments d
     LEFT JOIN employees e
       ON e.department_id = d.id
      AND e.deleted_at IS NULL
      AND e.is_active = 1
     WHERE d.deleted_at IS NULL AND d.is_active = 1
     GROUP BY d.id, d.code, d.name, d.office_type
     ORDER BY total_active DESC, d.name ASC`
  );

  return {
    columns: [
      { key: 'department_code', header: 'Code' },
      { key: 'department_name', header: 'Department' },
      { key: 'office_type',     header: 'Type' },
      { key: 'total_active',    header: 'Total Active', align: 'right' },
      { key: 'permanent',       header: 'Permanent', align: 'right' },
      { key: 'temporary',       header: 'Temporary', align: 'right' },
      { key: 'coterminous',     header: 'Coterminous', align: 'right' },
      { key: 'casual',          header: 'Casual', align: 'right' },
      { key: 'other',           header: 'Other', align: 'right' },
    ],
    rows,
    meta: { reportKind: 'aggregate' },
  };
}

async function orgHeadcountByStatus() {
  const [rows] = await pool.query(
    `SELECT
       employment_status,
       COUNT(*) AS count,
       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM employees
         WHERE deleted_at IS NULL AND is_active = 1), 2) AS pct
     FROM employees
     WHERE deleted_at IS NULL AND is_active = 1
     GROUP BY employment_status
     ORDER BY count DESC`
  );

  return {
    columns: [
      { key: 'employment_status', header: 'Employment Status' },
      { key: 'count',             header: 'Count', align: 'right' },
      { key: 'pct',               header: 'Percentage', align: 'right',
        format: (v) => v != null ? `${v}%` : '' },
    ],
    rows,
    meta: { reportKind: 'aggregate' },
  };
}

/* ================================================================== *
 *  ATTENDANCE REPORTS
 * ================================================================== */

async function attendanceMonthlySummary(filters = {}) {
  const now = new Date();
  const year  = toIntOr(filters.year,  now.getFullYear());
  const month = toIntOr(filters.month, now.getMonth() + 1);
  if (month < 1 || month > 12) {
    throw new AppError('Invalid month.', 400, 'VALIDATION_ERROR');
  }

  const params = [year, month];
  let deptFilter = '';
  if (filters.departmentId) {
    deptFilter = 'AND e.department_id = ?';
    params.push(Number(filters.departmentId));
  }

  const [rows] = await pool.query(
    `SELECT
       e.employee_number, e.full_name,
       d.code AS department_code, d.name AS department_name,
       a.working_days, a.days_worked, a.days_absent, a.days_leave, a.days_lwop,
       a.tardy_minutes_total, a.undertime_minutes_total, a.overtime_minutes_total,
       a.hours_worked_total, a.tardy_count, a.absence_count
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE a.period_year = ? AND a.period_month = ?
       AND e.deleted_at IS NULL
       ${deptFilter}
     ORDER BY d.name ASC, e.last_name ASC, e.first_name ASC`,
    params
  );

  return {
    columns: [
      { key: 'employee_number', header: 'Employee No.' },
      { key: 'full_name',       header: 'Full Name' },
      { key: 'department_name', header: 'Department' },
      { key: 'working_days',    header: 'Working Days', align: 'right' },
      { key: 'days_worked',     header: 'Days Worked', align: 'right' },
      { key: 'days_absent',     header: 'Absent', align: 'right' },
      { key: 'days_leave',      header: 'Leave', align: 'right' },
      { key: 'days_lwop',       header: 'LWOP', align: 'right' },
      { key: 'tardy_minutes_total', header: 'Tardy (min)', align: 'right' },
      { key: 'undertime_minutes_total', header: 'Undertime (min)', align: 'right' },
      { key: 'overtime_minutes_total', header: 'OT (min)', align: 'right' },
      { key: 'hours_worked_total', header: 'Hours Worked', align: 'right',
        format: (v) => v != null ? Number(v).toFixed(2) : '' },
      { key: 'tardy_count',     header: 'Tardy Days', align: 'right' },
      { key: 'absence_count',   header: 'Absence Days', align: 'right' },
    ],
    rows,
    meta: { reportKind: 'aggregate', period: { year, month } },
  };
}

async function attendanceCompliance(filters = {}) {
  const now = new Date();
  const year  = toIntOr(filters.year,  now.getFullYear());
  const month = toIntOr(filters.month, now.getMonth() + 1);

  const [rows] = await pool.query(
    `SELECT
       d.code AS department_code, d.name AS department_name,
       COUNT(*) AS employees,
       SUM(CASE WHEN a.tardy_minutes_total <= 60
                AND a.undertime_minutes_total <= 60
                AND a.absence_count <= 2 THEN 1 ELSE 0 END) AS compliant,
       SUM(CASE WHEN a.tardy_minutes_total > 60
                OR a.undertime_minutes_total > 60
                OR a.absence_count > 2 THEN 1 ELSE 0 END) AS non_compliant,
       ROUND(
         SUM(CASE WHEN a.tardy_minutes_total <= 60
                  AND a.undertime_minutes_total <= 60
                  AND a.absence_count <= 2 THEN 1 ELSE 0 END) * 100.0
         / NULLIF(COUNT(*), 0),
         2
       ) AS compliance_rate_pct
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE a.period_year = ? AND a.period_month = ?
       AND e.is_active = 1 AND e.deleted_at IS NULL
     GROUP BY d.id, d.code, d.name
     ORDER BY compliance_rate_pct ASC`,
    [year, month]
  );

  return {
    columns: [
      { key: 'department_code', header: 'Code' },
      { key: 'department_name', header: 'Department' },
      { key: 'employees',       header: 'Employees', align: 'right' },
      { key: 'compliant',       header: 'Compliant', align: 'right' },
      { key: 'non_compliant',   header: 'Non-Compliant', align: 'right' },
      { key: 'compliance_rate_pct', header: 'Compliance Rate', align: 'right',
        format: (v) => v != null ? `${v}%` : '' },
    ],
    rows,
    meta: { reportKind: 'aggregate', period: { year, month } },
  };
}

async function attendanceAbsenceTrend(filters = {}) {
  const months = Math.min(24, Math.max(1, toIntOr(filters.months, 6)));

  const [rows] = await pool.query(
    `SELECT
       a.period_year, a.period_month,
       COALESCE(SUM(a.tardy_minutes_total), 0) AS total_tardy_minutes,
       COALESCE(SUM(a.undertime_minutes_total), 0) AS total_undertime_minutes,
       COALESCE(SUM(a.absence_count), 0) AS total_absent_days,
       COALESCE(SUM(a.tardy_count), 0) AS total_tardy_days,
       COUNT(*) AS employees_with_summary
     FROM attendance_summaries a
     JOIN employees e ON e.id = a.employee_id
     WHERE e.is_active = 1 AND e.deleted_at IS NULL
       AND (a.period_year, a.period_month) >= (
         SELECT YEAR(DATE_SUB(CURDATE(), INTERVAL ? MONTH)),
                MONTH(DATE_SUB(CURDATE(), INTERVAL ? MONTH))
       )
     GROUP BY a.period_year, a.period_month
     ORDER BY a.period_year ASC, a.period_month ASC`,
    [months - 1, months - 1]
  );

  return {
    columns: [
      { key: 'period_year',  header: 'Year', align: 'right' },
      { key: 'period_month', header: 'Month', align: 'right' },
      { key: 'employees_with_summary', header: 'Employees', align: 'right' },
      { key: 'total_tardy_minutes', header: 'Tardy (min)', align: 'right' },
      { key: 'total_undertime_minutes', header: 'Undertime (min)', align: 'right' },
      { key: 'total_tardy_days', header: 'Tardy Days', align: 'right' },
      { key: 'total_absent_days', header: 'Absent Days', align: 'right' },
    ],
    rows,
    meta: { reportKind: 'aggregate', months },
  };
}

/* ================================================================== *
 *  LEAVE / CREDIT REPORTS
 * ================================================================== */

async function creditsBalances(filters = {}) {
  const where = ['e.deleted_at IS NULL', 'e.is_active = 1'];
  const params = [];

  if (filters.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(filters.departmentId));
  }

  const [rows] = await pool.query(
    `SELECT
       e.employee_number, e.full_name,
       d.code AS department_code, d.name AS department_name,
       lt.code AS leave_type_code, lt.name AS leave_type_name,
       b.balance, b.earned_ytd, b.used_ytd,
       b.last_transaction_at
     FROM leave_credit_balances b
     JOIN employees e    ON e.id = b.employee_id
     JOIN leave_types lt ON lt.id = b.leave_type_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.name ASC, e.last_name ASC, lt.sort_order ASC`,
    params
  );

  return {
    columns: [
      { key: 'employee_number', header: 'Employee No.' },
      { key: 'full_name',       header: 'Full Name' },
      { key: 'department_name', header: 'Department' },
      { key: 'leave_type_code', header: 'Type' },
      { key: 'leave_type_name', header: 'Leave Type' },
      { key: 'balance',         header: 'Balance', align: 'right',
        format: (v) => Number(v).toFixed(3) },
      { key: 'earned_ytd',      header: 'Earned YTD', align: 'right',
        format: (v) => Number(v).toFixed(3) },
      { key: 'used_ytd',        header: 'Used YTD', align: 'right',
        format: (v) => Number(v).toFixed(3) },
      { key: 'last_transaction_at', header: 'Last Activity' },
    ],
    rows,
    meta: { reportKind: 'list' },
  };
}

async function leavesUsage(filters = {}) {
  const year = toIntOr(filters.year, new Date().getFullYear());

  const where = [
    'la.status = ?',
    'YEAR(la.start_date) = ?',
    'la.deleted_at IS NULL',
  ];
  const params = ['approved', year];

  if (filters.leaveTypeId) {
    where.push('la.leave_type_id = ?');
    params.push(Number(filters.leaveTypeId));
  }
  if (filters.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(filters.departmentId));
  }

  const [rows] = await pool.query(
    `SELECT
       e.employee_number, e.full_name,
       d.code AS department_code, d.name AS department_name,
       lt.code AS leave_type_code, lt.name AS leave_type_name,
       COUNT(la.id) AS applications_count,
       SUM(la.total_days) AS total_days
     FROM leave_applications la
     JOIN employees e     ON e.id = la.employee_id
     JOIN leave_types lt  ON lt.id = la.leave_type_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${where.join(' AND ')}
     GROUP BY e.id, e.employee_number, e.full_name,
              d.code, d.name, lt.code, lt.name
     ORDER BY total_days DESC, e.last_name ASC`,
    params
  );

  return {
    columns: [
      { key: 'employee_number', header: 'Employee No.' },
      { key: 'full_name',       header: 'Full Name' },
      { key: 'department_name', header: 'Department' },
      { key: 'leave_type_code', header: 'Type' },
      { key: 'leave_type_name', header: 'Leave Type' },
      { key: 'applications_count', header: 'Applications', align: 'right' },
      { key: 'total_days',      header: 'Total Days', align: 'right',
        format: (v) => v != null ? Number(v).toFixed(2) : '' },
    ],
    rows,
    meta: { reportKind: 'aggregate', year },
  };
}

async function creditsLiability(filters = {}) {
  const asOfDate = filters.asOfDate ?? new Date().toISOString().slice(0, 10);

  const [rows] = await pool.query(
    `SELECT
       e.employee_number, e.full_name,
       d.code AS department_code, d.name AS department_name,
       p.title AS position_title,
       e.salary_grade, e.step_increment, e.monthly_salary,
       lt.code AS leave_type_code, lt.name AS leave_type_name,
       b.balance,
       ROUND(b.balance * (e.monthly_salary / 22), 2) AS monetary_value
     FROM leave_credit_balances b
     JOIN employees e     ON e.id = b.employee_id
     JOIN leave_types lt  ON lt.id = b.leave_type_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions   p ON p.id = e.position_id
     WHERE lt.is_encashable = 1
       AND lt.is_credited = 1
       AND e.is_active = 1
       AND e.deleted_at IS NULL
       AND e.monthly_salary IS NOT NULL
       AND b.balance > 0
     ORDER BY monetary_value DESC`
  );

  const total = rows.reduce((sum, r) => sum + Number(r.monetary_value ?? 0), 0);

  return {
    columns: [
      { key: 'employee_number', header: 'Employee No.' },
      { key: 'full_name',       header: 'Full Name' },
      { key: 'department_name', header: 'Department' },
      { key: 'position_title',  header: 'Position' },
      { key: 'monthly_salary',  header: 'Monthly Salary', align: 'right',
        format: (v) => v != null ? Number(v).toFixed(2) : '' },
      { key: 'leave_type_code', header: 'Type' },
      { key: 'balance',         header: 'Days', align: 'right',
        format: (v) => Number(v).toFixed(3) },
      { key: 'monetary_value',  header: 'Monetary Value', align: 'right',
        format: (v) => v != null ? Number(v).toFixed(2) : '' },
    ],
    rows,
    meta: {
      reportKind: 'aggregate',
      asOfDate,
      totalLiability: Math.round(total * 100) / 100,
      workingDaysPerMonth: 22,
    },
  };
}

async function leavesPendingApprovals() {
  const [rows] = await pool.query(
    `SELECT
       la.application_number, la.status,
       e.employee_number, e.full_name,
       d.code AS department_code, d.name AS department_name,
       lt.code AS leave_type_code, lt.name AS leave_type_name,
       la.start_date, la.end_date, la.total_days,
       la.filed_at,
       DATEDIFF(CURDATE(), DATE(la.filed_at)) AS days_pending
     FROM leave_applications la
     JOIN employees e    ON e.id = la.employee_id
     JOIN leave_types lt ON lt.id = la.leave_type_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE la.status IN ('pending_supervisor','pending_approver')
       AND la.deleted_at IS NULL
     ORDER BY la.filed_at ASC`
  );

  return {
    columns: [
      { key: 'application_number', header: 'Application No.' },
      { key: 'employee_number',    header: 'Employee No.' },
      { key: 'full_name',          header: 'Employee Name' },
      { key: 'department_name',    header: 'Department' },
      { key: 'leave_type_code',    header: 'Type' },
      { key: 'leave_type_name',    header: 'Leave Type' },
      { key: 'start_date',         header: 'Start' },
      { key: 'end_date',           header: 'End' },
      { key: 'total_days',         header: 'Days', align: 'right',
        format: (v) => Number(v).toFixed(2) },
      { key: 'status',             header: 'Status' },
      { key: 'days_pending',       header: 'Days Pending', align: 'right' },
      { key: 'filed_at',           header: 'Filed' },
    ],
    rows,
    meta: { reportKind: 'list' },
  };
}

/* ================================================================== *
 *  AUDIT REPORTS
 * ================================================================== */

async function auditRecent(filters = {}) {
  const days = Math.min(365, Math.max(1, toIntOr(filters.days, 30)));

  const [rows] = await pool.query(
    `SELECT
       id, event_time, actor_username, actor_role_code,
       action, entity_type, entity_id, entity_label,
       severity, http_method, http_path, http_status, ip_address
     FROM v_audit_logs_full
     WHERE event_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY event_time DESC
     LIMIT 5000`,
    [days]
  );

  return {
    columns: [
      { key: 'event_time',      header: 'Time' },
      { key: 'actor_username',  header: 'Actor' },
      { key: 'actor_role_code', header: 'Role' },
      { key: 'action',          header: 'Action' },
      { key: 'entity_type',     header: 'Entity Type' },
      { key: 'entity_id',       header: 'Entity ID', align: 'right' },
      { key: 'entity_label',    header: 'Entity' },
      { key: 'severity',        header: 'Severity' },
      { key: 'http_method',     header: 'Method' },
      { key: 'http_path',       header: 'Path' },
      { key: 'http_status',     header: 'Status', align: 'right' },
      { key: 'ip_address',      header: 'IP' },
    ],
    rows,
    meta: { reportKind: 'list', days },
  };
}

async function auditCritical() {
  const [rows] = await pool.query(
    `SELECT
       id, event_time, actor_username, actor_role_code,
       action, entity_type, entity_id, entity_label,
       severity, http_method, http_path, http_status, ip_address,
       changes, metadata
     FROM v_audit_logs_full
     WHERE severity IN ('warning','critical')
     ORDER BY event_time DESC
     LIMIT 5000`
  );

  return {
    columns: [
      { key: 'event_time',      header: 'Time' },
      { key: 'actor_username',  header: 'Actor' },
      { key: 'actor_role_code', header: 'Role' },
      { key: 'action',          header: 'Action' },
      { key: 'entity_label',    header: 'Entity' },
      { key: 'severity',        header: 'Severity' },
      { key: 'http_method',     header: 'Method' },
      { key: 'http_path',       header: 'Path' },
      { key: 'ip_address',      header: 'IP' },
    ],
    rows,
    meta: { reportKind: 'list' },
  };
}

async function auditUserActivity(filters = {}) {
  const days = Math.min(365, Math.max(1, toIntOr(filters.days, 30)));

  const [rows] = await pool.query(
    `SELECT
       actor_user_id, actor_username, actor_role_code,
       COUNT(*) AS total_actions,
       SUM(CASE WHEN action = 'create' THEN 1 ELSE 0 END) AS creates,
       SUM(CASE WHEN action = 'update' THEN 1 ELSE 0 END) AS updates,
       SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) AS deletes,
       SUM(CASE WHEN action IN ('approve','reject') THEN 1 ELSE 0 END) AS decisions,
       SUM(CASE WHEN severity IN ('warning','critical') THEN 1 ELSE 0 END) AS flagged,
       MAX(event_time) AS last_action_at
     FROM audit_logs
     WHERE event_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
       AND actor_user_id IS NOT NULL
     GROUP BY actor_user_id, actor_username, actor_role_code
     ORDER BY total_actions DESC`,
    [days]
  );

  return {
    columns: [
      { key: 'actor_username',  header: 'Actor' },
      { key: 'actor_role_code', header: 'Role' },
      { key: 'total_actions',   header: 'Total', align: 'right' },
      { key: 'creates',         header: 'Creates', align: 'right' },
      { key: 'updates',         header: 'Updates', align: 'right' },
      { key: 'deletes',         header: 'Deletes', align: 'right' },
      { key: 'decisions',       header: 'Approvals/Rejections', align: 'right' },
      { key: 'flagged',         header: 'Flagged', align: 'right' },
      { key: 'last_action_at',  header: 'Last Action' },
    ],
    rows,
    meta: { reportKind: 'aggregate', days },
  };
}

/* ================================================================== *
 *  Public registry
 * ================================================================== */
export const reportHandlers = Object.freeze({
  'employees.directory':        employeesDirectory,
  'documents.serviceRecord':    documentsServiceRecord,
  'documents.coe':              documentsCOE,
  'org.headcountByDepartment':  orgHeadcountByDepartment,
  'org.headcountByStatus':      orgHeadcountByStatus,
  'attendance.monthlySummary':  attendanceMonthlySummary,
  'attendance.compliance':      attendanceCompliance,
  'attendance.absenceTrend':    attendanceAbsenceTrend,
  'credits.balances':           creditsBalances,
  'leaves.usage':               leavesUsage,
  'credits.liability':          creditsLiability,
  'leaves.pendingApprovals':    leavesPendingApprovals,
  'audit.recent':               auditRecent,
  'audit.critical':             auditCritical,
  'audit.userActivity':         auditUserActivity,
});

/**
 * Retrieve a handler by its key. Throws if unknown.
 */
export function getReportHandler(handlerKey) {
  const fn = reportHandlers[handlerKey];
  if (typeof fn !== 'function') {
    throw new AppError(
      `Unknown report handler: ${handlerKey}`,
      400, 'UNKNOWN_HANDLER'
    );
  }
  return fn;
}

/** Exposed for diagnostics: list every registered handler key. */
export const listHandlerKeys = () => Object.keys(reportHandlers);