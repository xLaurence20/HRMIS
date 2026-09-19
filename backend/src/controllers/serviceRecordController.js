import { pool, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';
import { assertValid } from '../utils/validate.js';
import { mapServiceRecord } from './employeeController.js';

const RECORD_TYPES = [
  'Original Appointment','Promotion','Step Increment','Transfer','Reassignment',
  'Detail','Designation','Salary Adjustment','Reinstatement','Contract Renewal',
  'Separation','Retirement','Resignation','Drop from Rolls','Others',
];

const APPOINTMENT_TYPES = [
  'Permanent','Temporary','Coterminous','Casual','Contractual',
  'Job Order','Contract of Service','Substitute','Provisional','Emergency',
];

/* ================================================================== *
 *  GET /api/employees/:employeeId/service-records
 * ================================================================== */
export const listForEmployee = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');
  }

  const [emp] = await pool.query(
    'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
    [employeeId]
  );
  if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const [rows] = await pool.query(
    `SELECT sr.*, d.code AS department_code
       FROM service_records sr
       LEFT JOIN departments d ON d.id = sr.department_id
      WHERE sr.employee_id = ? AND sr.deleted_at IS NULL
      ORDER BY sr.sequence_no ASC, sr.from_date DESC`,
    [employeeId]
  );

  return ok(res, { serviceRecords: rows.map(mapServiceRecord) });
});

/* ================================================================== *
 *  POST /api/employees/:employeeId/service-records
 *  Auto-assigns sequence_no if not provided. If `isPresent = true`,
 *  closes any previous open record.
 * ================================================================== */
export const createServiceRecord = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    throw new AppError('Invalid employee id.', 400, 'VALIDATION_ERROR');
  }

  const body = assertValid(req.body ?? {}, [
    { name: 'sequenceNo',       type: 'int', min: 1, nullable: true },
    { name: 'recordType',       type: 'enum', required: true, enum: RECORD_TYPES },
    { name: 'fromDate',         type: 'date', required: true },
    { name: 'toDate',           type: 'date', nullable: true },
    { name: 'isPresent',        type: 'boolean', transform: (v) => v ?? false },
    { name: 'positionTitle',    type: 'string', required: true, min: 1, max: 200 },
    { name: 'positionId',       type: 'int', min: 1, nullable: true },
    { name: 'departmentId',     type: 'int', min: 1, nullable: true },
    { name: 'departmentName',   type: 'string', max: 200, nullable: true },
    { name: 'agency',           type: 'string', max: 200, nullable: true },
    { name: 'salaryGrade',      type: 'int', min: 1, max: 33, nullable: true },
    { name: 'stepIncrement',    type: 'int', min: 1, max: 8, nullable: true },
    { name: 'monthlySalary',    type: 'number', min: 0, nullable: true },
    { name: 'appointmentType',  type: 'enum', enum: APPOINTMENT_TYPES, nullable: true },
    { name: 'appointmentStatus', type: 'enum', enum: ['Active','Inactive','Cancelled'],
                                 transform: (v) => v ?? 'Active' },
    { name: 'leaveWithoutPay',  type: 'boolean', transform: (v) => v ?? false },
    { name: 'legalBasis',       type: 'string', max: 255, nullable: true },
    { name: 'documentRef',      type: 'string', max: 100, nullable: true },
    { name: 'documentPath',     type: 'string', max: 255, nullable: true },
    { name: 'ocrConfidence',    type: 'number', min: 0, max: 100, nullable: true },
    { name: 'remarks',          type: 'string', nullable: true },
  ]);

  // Business rule: isPresent and toDate are mutually exclusive
  if (body.isPresent && body.toDate) {
    throw new AppError('An ongoing record cannot have an end date.', 400, 'VALIDATION_ERROR', {
      fields: [{ field: 'toDate', message: 'Clear the end date or uncheck "still in effect".' }],
    });
  }

  const result = await withTransaction(async (conn) => {
    const [emp] = await conn.query(
      'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [employeeId]
    );
    if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

    // If marking as present, close the previous open one.
    if (body.isPresent) {
      await conn.query(
        `UPDATE service_records
            SET is_present = 0,
                to_date = DATE_SUB(?, INTERVAL 1 DAY),
                updated_by = ?
          WHERE employee_id = ? AND is_present = 1 AND deleted_at IS NULL`,
        [body.fromDate, req.user.id, employeeId]
      );
    }

    // Auto sequence number if not provided
    let sequenceNo = body.sequenceNo;
    if (!sequenceNo) {
      const [maxRow] = await conn.query(
        'SELECT COALESCE(MAX(sequence_no), 0) AS m FROM service_records WHERE employee_id = ?',
        [employeeId]
      );
      sequenceNo = Number(maxRow[0].m) + 1;
    }

    // Snapshot department name if we only have an id
    let deptName = body.departmentName ?? null;
    if (!deptName && body.departmentId) {
      const [d] = await conn.query('SELECT name FROM departments WHERE id = ?', [body.departmentId]);
      if (d[0]) deptName = d[0].name;
    }

    const [ins] = await conn.query(
      `INSERT INTO service_records
         (employee_id, sequence_no, record_type, from_date, to_date, is_present,
          position_title, position_id, department_id, department_name, agency,
          salary_grade, step_increment, monthly_salary,
          appointment_type, appointment_status, leave_without_pay,
          legal_basis, document_ref, document_path, ocr_confidence, remarks,
          created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId, sequenceNo, body.recordType, body.fromDate,
        body.toDate ?? null, body.isPresent ? 1 : 0,
        body.positionTitle, body.positionId ?? null,
        body.departmentId ?? null, deptName, body.agency ?? null,
        body.salaryGrade ?? null, body.stepIncrement ?? null,
        body.monthlySalary ?? null,
        body.appointmentType ?? null, body.appointmentStatus,
        body.leaveWithoutPay ? 1 : 0,
        body.legalBasis ?? null, body.documentRef ?? null,
        body.documentPath ?? null, body.ocrConfidence ?? null,
        body.remarks ?? null,
        req.user.id, req.user.id,
      ]
    );

    return { insertId: ins.insertId };
  });

  const [rows] = await pool.query(
    `SELECT sr.*, d.code AS department_code
       FROM service_records sr
       LEFT JOIN departments d ON d.id = sr.department_id
      WHERE sr.id = ?`,
    [result.insertId]
  );

  return ok(res, { serviceRecord: mapServiceRecord(rows[0]) }, 201);
});

/* ================================================================== *
 *  PUT /api/service-records/:id
 * ================================================================== */
export const updateServiceRecord = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid service record id.', 400, 'VALIDATION_ERROR');

  const body = assertValid(req.body ?? {}, [
    { name: 'sequenceNo',       type: 'int', min: 1 },
    { name: 'recordType',       type: 'enum', enum: RECORD_TYPES },
    { name: 'fromDate',         type: 'date' },
    { name: 'toDate',           type: 'date', nullable: true },
    { name: 'isPresent',        type: 'boolean' },
    { name: 'positionTitle',    type: 'string', min: 1, max: 200 },
    { name: 'positionId',       type: 'int', min: 1, nullable: true },
    { name: 'departmentId',     type: 'int', min: 1, nullable: true },
    { name: 'departmentName',   type: 'string', max: 200, nullable: true },
    { name: 'agency',           type: 'string', max: 200, nullable: true },
    { name: 'salaryGrade',      type: 'int', min: 1, max: 33, nullable: true },
    { name: 'stepIncrement',    type: 'int', min: 1, max: 8, nullable: true },
    { name: 'monthlySalary',    type: 'number', min: 0, nullable: true },
    { name: 'appointmentType',  type: 'enum', enum: APPOINTMENT_TYPES, nullable: true },
    { name: 'appointmentStatus', type: 'enum', enum: ['Active','Inactive','Cancelled'] },
    { name: 'leaveWithoutPay',  type: 'boolean' },
    { name: 'legalBasis',       type: 'string', max: 255, nullable: true },
    { name: 'documentRef',      type: 'string', max: 100, nullable: true },
    { name: 'documentPath',     type: 'string', max: 255, nullable: true },
    { name: 'ocrConfidence',    type: 'number', min: 0, max: 100, nullable: true },
    { name: 'remarks',          type: 'string', nullable: true },
  ]);

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');
  }

  if (body.isPresent === true && body.toDate) {
    throw new AppError('An ongoing record cannot have an end date.', 400, 'VALIDATION_ERROR', {
      fields: [{ field: 'toDate', message: 'Clear the end date or uncheck "still in effect".' }],
    });
  }

  const columnMap = {
    sequenceNo: 'sequence_no', recordType: 'record_type',
    fromDate: 'from_date', toDate: 'to_date', isPresent: 'is_present',
    positionTitle: 'position_title', positionId: 'position_id',
    departmentId: 'department_id', departmentName: 'department_name',
    agency: 'agency', salaryGrade: 'salary_grade', stepIncrement: 'step_increment',
    monthlySalary: 'monthly_salary', appointmentType: 'appointment_type',
    appointmentStatus: 'appointment_status', leaveWithoutPay: 'leave_without_pay',
    legalBasis: 'legal_basis', documentRef: 'document_ref',
    documentPath: 'document_path', ocrConfidence: 'ocr_confidence', remarks: 'remarks',
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
    `UPDATE service_records SET ${sets.join(', ')}
      WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (result.affectedRows === 0) {
    throw new AppError('Service record not found.', 404, 'NOT_FOUND');
  }

  const [rows] = await pool.query(
    `SELECT sr.*, d.code AS department_code
       FROM service_records sr
       LEFT JOIN departments d ON d.id = sr.department_id
      WHERE sr.id = ?`,
    [id]
  );

  return ok(res, { serviceRecord: mapServiceRecord(rows[0]) });
});

/* ================================================================== *
 *  DELETE /api/service-records/:id  (soft)
 * ================================================================== */
export const deleteServiceRecord = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError('Invalid service record id.', 400, 'VALIDATION_ERROR');

  const [result] = await pool.query(
    `UPDATE service_records
        SET deleted_at = NOW(), updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [req.user.id, id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Service record not found.', 404, 'NOT_FOUND');
  }

  return ok(res, { message: 'Service record deleted.' });
});