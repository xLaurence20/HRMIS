import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid, parsePagination, parseSort } from '../utils/validate.js';

const SORTABLE = [
  'employee_number', 'last_name', 'first_name',
  'date_hired', 'salary_grade', 'created_at',
];

const EMPLOYMENT_STATUSES = [
  'Permanent','Temporary','Coterminous','Casual','Contractual',
  'Job Order','Contract of Service','Substitute','Provisional',
  'Emergency','Separated','Retired',
];

const mapEmployeeList = (row) => ({
  id: row.id,
  employeeNumber: row.employee_number,
  fullName: row.full_name,
  firstName: row.first_name,
  middleName: row.middle_name,
  lastName: row.last_name,
  gender: row.gender,
  birthDate: row.birth_date,
  age: row.age !== undefined ? Number(row.age) : undefined,
  employmentStatus: row.employment_status,
  dateHired: row.date_hired,
  yearsInService: row.years_in_service !== undefined ? Number(row.years_in_service) : undefined,
  salaryGrade: row.salary_grade,
  stepIncrement: row.step_increment,
  monthlySalary: row.monthly_salary !== null ? Number(row.monthly_salary) : null,
  mobileNo: row.mobile_no,
  personalEmail: row.personal_email,
  photoPath: row.photo_path,
  isActive: Boolean(row.is_active),
  departmentId: row.department_id,
  departmentCode: row.department_code,
  departmentName: row.department_name,
  positionId: row.position_id,
  positionTitle: row.position_title,
  positionCode: row.position_code,
  isSupervisory: row.is_supervisory !== null && row.is_supervisory !== undefined
    ? Boolean(row.is_supervisory)
    : null,
  userId: row.user_id,
  username: row.username,
  userStatus: row.user_status,
  supervisorId: row.supervisor_id,
  supervisorName: row.supervisor_name,
});

const mapEmployeeDetail = (row) => ({
  ...mapEmployeeList(row),
  // Personal
  birthPlace: row.birth_place,
  civilStatus: row.civil_status,
  citizenship: row.citizenship,
  bloodType: row.blood_type,
  heightCm: row.height_cm !== null ? Number(row.height_cm) : null,
  weightKg: row.weight_kg !== null ? Number(row.weight_kg) : null,
  religion: row.religion,
  // Contact
  telephoneNo: row.telephone_no,
  // Address
  address: {
    houseNo: row.addr_house_no,
    street: row.addr_street,
    barangay: row.addr_barangay,
    cityMunicipality: row.addr_city_municipality,
    province: row.addr_province,
    region: row.addr_region,
    zipCode: row.addr_zip_code,
  },
  // Gov IDs
  gsisNo: row.gsis_no,
  pagibigNo: row.pagibig_no,
  philhealthNo: row.philhealth_no,
  sssNo: row.sss_no,
  tin: row.tin,
  agencyEmployeeNo: row.agency_employee_no,
  // Employment detail
  dateRegularized: row.date_regularized,
  dateSeparated: row.date_separated,
  separationReason: row.separation_reason,
  signaturePath: row.signature_path,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ================================================================== *
 *  GET /api/employees
 *  Query: ?search=  ?departmentId=  ?status=  ?activeOnly=
 *         ?page=  ?limit=  ?sort=last_name:asc
 * ================================================================== */
export const listEmployees = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const orderBy = parseSort(req.query, SORTABLE, 'last_name ASC, first_name ASC');
  const activeOnly = req.query.activeOnly !== 'false';

  const where = ['e.deleted_at IS NULL'];
  const params = [];

  if (activeOnly) where.push('e.is_active = 1');

  if (req.query.departmentId) {
    where.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.status) {
    if (!EMPLOYMENT_STATUSES.includes(req.query.status)) {
      throw new AppError('Invalid employment status filter.', 400, 'VALIDATION_ERROR');
    }
    where.push('e.employment_status = ?');
    params.push(req.query.status);
  }
  if (req.query.search) {
    const q = `%${req.query.search.trim()}%`;
    where.push(
      `(e.last_name LIKE ? OR e.first_name LIKE ?
        OR e.middle_name LIKE ? OR e.employee_number LIKE ?)`
    );
    params.push(q, q, q, q);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM employees e ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_number, e.full_name, e.first_name, e.middle_name, e.last_name,
            e.gender, e.birth_date,
            TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS age,
            e.employment_status, e.date_hired,
            TIMESTAMPDIFF(YEAR, e.date_hired, CURDATE()) AS years_in_service,
            e.salary_grade, e.step_increment, e.monthly_salary,
            e.mobile_no, e.personal_email, e.photo_path, e.is_active,
            e.supervisor_id,
            d.id AS department_id, d.code AS department_code, d.name AS department_name,
            p.id AS position_id, p.code AS position_code, p.title AS position_title,
            p.is_supervisory,
            u.id AS user_id, u.username, u.status AS user_status,
            sup.full_name AS supervisor_name
       FROM employees e
       LEFT JOIN departments d   ON d.id = e.department_id
       LEFT JOIN positions   p   ON p.id = e.position_id
       LEFT JOIN users       u   ON u.id = e.user_id
       LEFT JOIN employees   sup ON sup.id = e.supervisor_id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = Number(countRows[0].total);
  return ok(res, {
    employees: rows.map(mapEmployeeList),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ================================================================== *
 *  GET /api/employees/:id   (full detail + related collections)
 * ================================================================== */
export const getEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');

  const [rows] = await pool.query(
    `SELECT e.*,
            TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS age,
            TIMESTAMPDIFF(YEAR, e.date_hired, CURDATE()) AS years_in_service,
            d.code AS department_code, d.name AS department_name,
            p.code AS position_code, p.title AS position_title, p.is_supervisory,
            u.username, u.status AS user_status,
            sup.full_name AS supervisor_name
       FROM employees e
       LEFT JOIN departments d   ON d.id = e.department_id
       LEFT JOIN positions   p   ON p.id = e.position_id
       LEFT JOIN users       u   ON u.id = e.user_id
       LEFT JOIN employees   sup ON sup.id = e.supervisor_id
      WHERE e.id = ? AND e.deleted_at IS NULL`,
    [id]
  );

  if (!rows[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const [serviceRecords] = await pool.query(
    `SELECT sr.*, d.code AS department_code
       FROM service_records sr
       LEFT JOIN departments d ON d.id = sr.department_id
      WHERE sr.employee_id = ? AND sr.deleted_at IS NULL
      ORDER BY sr.sequence_no ASC, sr.from_date DESC`,
    [id]
  );

  const [education] = await pool.query(
    'SELECT * FROM employee_education WHERE employee_id = ? ORDER BY year_graduated DESC',
    [id]
  );
  const [eligibility] = await pool.query(
    'SELECT * FROM employee_eligibility WHERE employee_id = ? ORDER BY date_taken DESC',
    [id]
  );
  const [trainings] = await pool.query(
    'SELECT * FROM employee_trainings WHERE employee_id = ? ORDER BY date_from DESC',
    [id]
  );
  const [dependents] = await pool.query(
    'SELECT * FROM employee_dependents WHERE employee_id = ? ORDER BY relationship, full_name',
    [id]
  );

  return ok(res, {
    employee: mapEmployeeDetail(rows[0]),
    serviceRecords: serviceRecords.map(mapServiceRecord),
    education: education.map(mapEducation),
    eligibility: eligibility.map(mapEligibility),
    trainings: trainings.map(mapTraining),
    dependents: dependents.map(mapDependent),
  });
});

/* ------------------------------------------------------------------ *
 *  Related-row mappers (used above and by the serviceRecord controller)
 * ------------------------------------------------------------------ */
export const mapServiceRecord = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  sequenceNo: row.sequence_no,
  recordType: row.record_type,
  fromDate: row.from_date,
  toDate: row.to_date,
  isPresent: Boolean(row.is_present),
  positionTitle: row.position_title,
  positionId: row.position_id,
  departmentId: row.department_id,
  departmentName: row.department_name,
  departmentCode: row.department_code ?? null,
  agency: row.agency,
  salaryGrade: row.salary_grade,
  stepIncrement: row.step_increment,
  monthlySalary: row.monthly_salary !== null ? Number(row.monthly_salary) : null,
  appointmentType: row.appointment_type,
  appointmentStatus: row.appointment_status,
  leaveWithoutPay: Boolean(row.leave_without_pay),
  legalBasis: row.legal_basis,
  documentRef: row.document_ref,
  documentPath: row.document_path,
  ocrConfidence: row.ocr_confidence !== null ? Number(row.ocr_confidence) : null,
  verifiedBy: row.verified_by,
  verifiedAt: row.verified_at,
  remarks: row.remarks,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapEducation = (row) => ({
  id: row.id,
  level: row.level,
  schoolName: row.school_name,
  degreeCourse: row.degree_course,
  yearFrom: row.year_from,
  yearTo: row.year_to,
  highestLevelUnits: row.highest_level_units,
  yearGraduated: row.year_graduated,
  honors: row.honors,
});

const mapEligibility = (row) => ({
  id: row.id,
  eligibilityName: row.eligibility_name,
  rating: row.rating,
  dateTaken: row.date_taken,
  placeTaken: row.place_taken,
  licenseNo: row.license_no,
  licenseValidUntil: row.license_valid_until,
});

const mapTraining = (row) => ({
  id: row.id,
  title: row.title,
  conductedBy: row.conducted_by,
  level: row.level,
  dateFrom: row.date_from,
  dateTo: row.date_to,
  hours: row.hours !== null ? Number(row.hours) : null,
  certificatePath: row.certificate_path,
});

const mapDependent = (row) => ({
  id: row.id,
  fullName: row.full_name,
  relationship: row.relationship,
  birthDate: row.birth_date,
  isBeneficiary: Boolean(row.is_beneficiary),
});

/* ================================================================== *
 *  POST /api/employees
 * ================================================================== */
export const createEmployee = asyncHandler(async (req, res) => {
  const body = assertValid(req.body ?? {}, [
    // Identity
    { name: 'employeeNumber', type: 'string', required: true, min: 1, max: 30 },
    { name: 'lastName',       type: 'string', required: true, min: 1, max: 80 },
    { name: 'firstName',      type: 'string', required: true, min: 1, max: 80 },
    { name: 'middleName',     type: 'string', max: 80, nullable: true },
    { name: 'nameExtension',  type: 'string', max: 20, nullable: true },
    // Personal
    { name: 'gender',         type: 'enum', required: true, enum: ['Male','Female'] },
    { name: 'birthDate',      type: 'date', required: true },
    { name: 'birthPlace',     type: 'string', max: 200, nullable: true },
    { name: 'civilStatus',    type: 'enum',
      enum: ['Single','Married','Widowed','Separated','Annulled','Other'], nullable: true },
    { name: 'citizenship',    type: 'string', max: 60, transform: (v) => v ?? 'Filipino' },
    { name: 'bloodType',      type: 'string', max: 5, nullable: true },
    { name: 'heightCm',       type: 'number', min: 0, max: 300, nullable: true },
    { name: 'weightKg',       type: 'number', min: 0, max: 500, nullable: true },
    { name: 'religion',       type: 'string', max: 80, nullable: true },
    // Contact
    { name: 'mobileNo',       type: 'string', max: 20, nullable: true },
    { name: 'telephoneNo',    type: 'string', max: 20, nullable: true },
    { name: 'personalEmail',  type: 'string', max: 150, nullable: true },
    // Address
    { name: 'addrHouseNo',          type: 'string', max: 60, nullable: true },
    { name: 'addrStreet',           type: 'string', max: 150, nullable: true },
    { name: 'addrBarangay',         type: 'string', max: 100, nullable: true },
    { name: 'addrCityMunicipality', type: 'string', max: 100, nullable: true },
    { name: 'addrProvince',         type: 'string', max: 100, nullable: true },
    { name: 'addrRegion',           type: 'string', max: 100, nullable: true },
    { name: 'addrZipCode',          type: 'string', max: 10, nullable: true },
    // Gov IDs
    { name: 'gsisNo',         type: 'string', max: 30, nullable: true },
    { name: 'pagibigNo',      type: 'string', max: 30, nullable: true },
    { name: 'philhealthNo',   type: 'string', max: 30, nullable: true },
    { name: 'sssNo',          type: 'string', max: 30, nullable: true },
    { name: 'tin',            type: 'string', max: 30, nullable: true },
    { name: 'agencyEmployeeNo', type: 'string', max: 30, nullable: true },
    // Employment
    { name: 'departmentId',     type: 'int', min: 1, nullable: true },
    { name: 'positionId',       type: 'int', min: 1, nullable: true },
    { name: 'supervisorId',     type: 'int', min: 1, nullable: true },
    { name: 'employmentStatus', type: 'enum', enum: EMPLOYMENT_STATUSES,
                                transform: (v) => v ?? 'Permanent' },
    { name: 'dateHired',        type: 'date', nullable: true },
    { name: 'dateRegularized',  type: 'date', nullable: true },
    { name: 'salaryGrade',      type: 'int', min: 1, max: 33, nullable: true },
    { name: 'stepIncrement',    type: 'int', min: 1, max: 8, nullable: true },
    { name: 'monthlySalary',    type: 'number', min: 0, nullable: true },
    { name: 'isActive',         type: 'boolean', transform: (v) => (v === undefined ? true : v) },
  ]);

  // Cross-field: supervisorId must not equal self (self-check on create is
  // moot since we don't have an id yet, but must not be null-yet-referenced).
  if (body.supervisorId) {
    const [sup] = await pool.query(
      'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
      [body.supervisorId]
    );
    if (!sup[0]) {
      throw new AppError('Supervisor not found.', 400, 'VALIDATION_ERROR', {
        fields: [{ field: 'supervisorId', message: 'Employee does not exist.' }],
      });
    }
  }

  const [result] = await pool.query(
    `INSERT INTO employees
       (employee_number, last_name, first_name, middle_name, name_extension,
        gender, birth_date, birth_place, civil_status, citizenship,
        blood_type, height_cm, weight_kg, religion,
        mobile_no, telephone_no, personal_email,
        addr_house_no, addr_street, addr_barangay,
        addr_city_municipality, addr_province, addr_region, addr_zip_code,
        gsis_no, pagibig_no, philhealth_no, sss_no, tin, agency_employee_no,
        department_id, position_id, supervisor_id,
        employment_status, date_hired, date_regularized,
        salary_grade, step_increment, monthly_salary, is_active,
        created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?)`,
    [
      body.employeeNumber, body.lastName, body.firstName,
      body.middleName ?? null, body.nameExtension ?? null,
      body.gender, body.birthDate, body.birthPlace ?? null,
      body.civilStatus ?? null, body.citizenship,
      body.bloodType ?? null, body.heightCm ?? null,
      body.weightKg ?? null, body.religion ?? null,
      body.mobileNo ?? null, body.telephoneNo ?? null, body.personalEmail ?? null,
      body.addrHouseNo ?? null, body.addrStreet ?? null, body.addrBarangay ?? null,
      body.addrCityMunicipality ?? null, body.addrProvince ?? null,
      body.addrRegion ?? null, body.addrZipCode ?? null,
      body.gsisNo ?? null, body.pagibigNo ?? null, body.philhealthNo ?? null,
      body.sssNo ?? null, body.tin ?? null, body.agencyEmployeeNo ?? null,
      body.departmentId ?? null, body.positionId ?? null, body.supervisorId ?? null,
      body.employmentStatus, body.dateHired ?? null, body.dateRegularized ?? null,
      body.salaryGrade ?? null, body.stepIncrement ?? null,
      body.monthlySalary ?? null, body.isActive ? 1 : 0,
      req.user.id, req.user.id,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM employees WHERE id = ?', [result.insertId]);
  return ok(res, { employee: mapEmployeeDetail(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/employees/:id
 * ================================================================== */
export const updateEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'employeeNumber', type: 'string', min: 1, max: 30 },
    { name: 'lastName',       type: 'string', min: 1, max: 80 },
    { name: 'firstName',      type: 'string', min: 1, max: 80 },
    { name: 'middleName',     type: 'string', max: 80, nullable: true },
    { name: 'nameExtension',  type: 'string', max: 20, nullable: true },
    { name: 'gender',         type: 'enum', enum: ['Male','Female'] },
    { name: 'birthDate',      type: 'date' },
    { name: 'birthPlace',     type: 'string', max: 200, nullable: true },
    { name: 'civilStatus',    type: 'enum',
      enum: ['Single','Married','Widowed','Separated','Annulled','Other'], nullable: true },
    { name: 'citizenship',    type: 'string', max: 60 },
    { name: 'bloodType',      type: 'string', max: 5, nullable: true },
    { name: 'heightCm',       type: 'number', min: 0, max: 300, nullable: true },
    { name: 'weightKg',       type: 'number', min: 0, max: 500, nullable: true },
    { name: 'religion',       type: 'string', max: 80, nullable: true },
    { name: 'mobileNo',       type: 'string', max: 20, nullable: true },
    { name: 'telephoneNo',    type: 'string', max: 20, nullable: true },
    { name: 'personalEmail',  type: 'string', max: 150, nullable: true },
    { name: 'addrHouseNo',          type: 'string', max: 60, nullable: true },
    { name: 'addrStreet',           type: 'string', max: 150, nullable: true },
    { name: 'addrBarangay',         type: 'string', max: 100, nullable: true },
    { name: 'addrCityMunicipality', type: 'string', max: 100, nullable: true },
    { name: 'addrProvince',         type: 'string', max: 100, nullable: true },
    { name: 'addrRegion',           type: 'string', max: 100, nullable: true },
    { name: 'addrZipCode',          type: 'string', max: 10, nullable: true },
    { name: 'gsisNo',         type: 'string', max: 30, nullable: true },
    { name: 'pagibigNo',      type: 'string', max: 30, nullable: true },
    { name: 'philhealthNo',   type: 'string', max: 30, nullable: true },
    { name: 'sssNo',          type: 'string', max: 30, nullable: true },
    { name: 'tin',            type: 'string', max: 30, nullable: true },
    { name: 'agencyEmployeeNo', type: 'string', max: 30, nullable: true },
    { name: 'departmentId',     type: 'int', min: 1, nullable: true },
    { name: 'positionId',       type: 'int', min: 1, nullable: true },
    { name: 'supervisorId',     type: 'int', min: 1, nullable: true },
    { name: 'employmentStatus', type: 'enum', enum: EMPLOYMENT_STATUSES },
    { name: 'dateHired',        type: 'date', nullable: true },
    { name: 'dateRegularized',  type: 'date', nullable: true },
    { name: 'dateSeparated',    type: 'date', nullable: true },
    { name: 'separationReason', type: 'string', max: 150, nullable: true },
    { name: 'salaryGrade',      type: 'int', min: 1, max: 33, nullable: true },
    { name: 'stepIncrement',    type: 'int', min: 1, max: 8, nullable: true },
    { name: 'monthlySalary',    type: 'number', min: 0, nullable: true },
    { name: 'isActive',         type: 'boolean' },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  // Guard: cannot be own supervisor
  if (body.supervisorId === id) {
    throw new AppError('An employee cannot be their own supervisor.', 400, 'VALIDATION_ERROR', {
      fields: [{ field: 'supervisorId', message: 'Cannot be self.' }],
    });
  }

  // Guard: supervisor chain cannot cycle
  if (body.supervisorId) {
    const [chain] = await pool.query(
      `WITH RECURSIVE chain AS (
         SELECT id, supervisor_id FROM employees WHERE id = ?
         UNION ALL
         SELECT e.id, e.supervisor_id
           FROM employees e
           JOIN chain c ON e.id = c.supervisor_id
       )
       SELECT id FROM chain WHERE id = ?`,
      [body.supervisorId, id]
    );
    if (chain.length) {
      throw new AppError('Supervisor chain would create a cycle.', 400, 'VALIDATION_ERROR', {
        fields: [{ field: 'supervisorId', message: 'Would create a cycle.' }],
      });
    }
  }

  const columnMap = {
    employeeNumber: 'employee_number',
    lastName: 'last_name', firstName: 'first_name',
    middleName: 'middle_name', nameExtension: 'name_extension',
    gender: 'gender', birthDate: 'birth_date', birthPlace: 'birth_place',
    civilStatus: 'civil_status', citizenship: 'citizenship',
    bloodType: 'blood_type', heightCm: 'height_cm', weightKg: 'weight_kg',
    religion: 'religion',
    mobileNo: 'mobile_no', telephoneNo: 'telephone_no', personalEmail: 'personal_email',
    addrHouseNo: 'addr_house_no', addrStreet: 'addr_street',
    addrBarangay: 'addr_barangay', addrCityMunicipality: 'addr_city_municipality',
    addrProvince: 'addr_province', addrRegion: 'addr_region', addrZipCode: 'addr_zip_code',
    gsisNo: 'gsis_no', pagibigNo: 'pagibig_no', philhealthNo: 'philhealth_no',
    sssNo: 'sss_no', tin: 'tin', agencyEmployeeNo: 'agency_employee_no',
    departmentId: 'department_id', positionId: 'position_id',
    supervisorId: 'supervisor_id',
    employmentStatus: 'employment_status',
    dateHired: 'date_hired', dateRegularized: 'date_regularized',
    dateSeparated: 'date_separated', separationReason: 'separation_reason',
    salaryGrade: 'salary_grade', stepIncrement: 'step_increment',
    monthlySalary: 'monthly_salary', isActive: 'is_active',
  };

  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(body)) {
    sets.push(`${columnMap[key]} = ?`);
    params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  sets.push('updated_by = ?');
  params.push(req.user.id);
  params.push(id);

  const [result] = await pool.query(
    `UPDATE employees SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query('SELECT * FROM employees WHERE id = ?', [id]);
  return ok(res, { employee: mapEmployeeDetail(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/employees/:id  (soft)
 *  Also unlinks the user account and clears department head references.
 * ================================================================== */
export const deleteEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');

  await withTransaction(async (conn) => {
    const [emp] = await conn.query(
      'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

    // Clear department head references (SET NULL via FK would work if we
    // hard-deleted; for soft-delete we clear explicitly).
    await conn.query(
      'UPDATE departments SET head_employee_id = NULL WHERE head_employee_id = ?',
      [id]
    );

    // Clear supervisor references from other employees.
    await conn.query(
      'UPDATE employees SET supervisor_id = NULL WHERE supervisor_id = ?',
      [id]
    );

    await conn.query(
      'UPDATE employees SET deleted_at = NOW(), is_active = 0, updated_by = ? WHERE id = ?',
      [req.user.id, id]
    );
  });

  return ok(res, { message: 'Employee archived.' });
});

/* ================================================================== *
 *  POST /api/employees/:id/link-user
 *  Body: { userId: number }
 * ================================================================== */
export const linkUserAccount = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.body?.userId);

  if (!Number.isInteger(id) || !Number.isInteger(userId)) {
    throw new AppError('Invalid employee or user id.', 400, 'VALIDATION_ERROR');
  }

  await withTransaction(async (conn) => {
    const [emp] = await conn.query(
      'SELECT id, user_id FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    if (emp[0].user_id) {
      throw new AppError('This employee is already linked to a user account.',
        409, 'ALREADY_LINKED');
    }

    const [usr] = await conn.query(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    if (!usr[0]) throw new AppError('User account not found.', 404, 'NOT_FOUND');

    // uq_emp_user on employees.user_id ensures no double-link
    await conn.query('UPDATE employees SET user_id = ?, updated_by = ? WHERE id = ?',
      [userId, req.user.id, id]);
  });

  return ok(res, { message: 'User account linked.' });
});

/* ================================================================== *
 *  DELETE /api/employees/:id/link-user
 * ================================================================== */
export const unlinkUserAccount = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');

  const [result] = await pool.query(
    `UPDATE employees
        SET user_id = NULL, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [req.user.id, id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  }

  return ok(res, { message: 'User account unlinked.' });
});

/* ================================================================== *
 *  GET /api/employees/lookups/supervisors
 *  Returns a lightweight list of employees eligible to be supervisors
 *  (active, not self, not already in a cycle). Used by the form.
 * ================================================================== */
export const listSupervisorCandidates = asyncHandler(async (req, res) => {
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
  const params = [];
  let where = 'e.deleted_at IS NULL AND e.is_active = 1';

  if (excludeId) {
    where += ' AND e.id <> ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_number, e.full_name,
            p.title AS position_title, p.is_supervisory
       FROM employees e
       LEFT JOIN positions p ON p.id = e.position_id
      WHERE ${where}
      ORDER BY e.full_name`,
    params
  );

  return ok(res, {
    supervisors: rows.map((r) => ({
      id: r.id,
      employeeNumber: r.employee_number,
      fullName: r.full_name,
      positionTitle: r.position_title,
      isSupervisory: Boolean(r.is_supervisory),
    })),
  });
});