import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/request.js';

/* ------------------------------------------------------------------ *
 *  Daily rate helper — used for leave liability.
 *  CSC practice: monthly_salary / 22 (average working days).
 * ------------------------------------------------------------------ */
const WORKING_DAYS_PER_MONTH = 22;

/* ================================================================== *
 *  GET /api/dashboard/executive
 *  Query: ?year=&month=  (defaults to current month)
 * ================================================================== */
export const getExecutiveDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  if (month < 1 || month > 12) {
    throw new AppError('Invalid month.', 400, 'VALIDATION_ERROR');
  }

  /* ---------------------------------------------------------------- *
   *  Run every query in parallel — the dashboard loads in one round trip
   * ---------------------------------------------------------------- */
  const [
    [headcount],
    [statusRows],
    [deptRows],
    [salaryRows],
    [ageRows],
    [genderRows],
    [leaveLiability],
    [leaveLiabilityByType],
    [attendanceCompliance],
    [monthlyTrend],
    [recentHires],
    [pendingApprovals],
  ] = await Promise.all([

    // 1. Total headcount + activity state
    pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive,
         SUM(CASE WHEN employment_status = 'Permanent' THEN 1 ELSE 0 END) AS permanent,
         SUM(CASE WHEN employment_status NOT IN ('Permanent','Separated','Retired')
                   AND is_active = 1 THEN 1 ELSE 0 END) AS non_permanent,
         SUM(CASE WHEN employment_status IN ('Separated','Retired') THEN 1 ELSE 0 END) AS separated
       FROM employees
       WHERE deleted_at IS NULL`
    ),

    // 2. Headcount by employment status
    pool.query(
      `SELECT employment_status, COUNT(*) AS count
         FROM employees
        WHERE deleted_at IS NULL AND is_active = 1
        GROUP BY employment_status
        ORDER BY count DESC`
    ),

    // 3. Headcount by department
    pool.query(
      `SELECT
         d.id, d.code, d.name,
         COUNT(e.id) AS employee_count,
         SUM(CASE WHEN e.employment_status = 'Permanent' THEN 1 ELSE 0 END) AS permanent_count
       FROM departments d
       LEFT JOIN employees e
         ON e.department_id = d.id
        AND e.deleted_at IS NULL
        AND e.is_active = 1
      WHERE d.deleted_at IS NULL AND d.is_active = 1
      GROUP BY d.id, d.code, d.name
      ORDER BY employee_count DESC, d.name ASC`
    ),

    // 4. Salary grade distribution
    pool.query(
      `SELECT
         salary_grade,
         COUNT(*) AS count
       FROM employees
      WHERE deleted_at IS NULL
        AND is_active = 1
        AND salary_grade IS NOT NULL
      GROUP BY salary_grade
      ORDER BY salary_grade ASC`
    ),

    // 5. Age distribution buckets
    pool.query(
      `SELECT
         CASE
           WHEN age < 30 THEN 'Under 30'
           WHEN age BETWEEN 30 AND 39 THEN '30–39'
           WHEN age BETWEEN 40 AND 49 THEN '40–49'
           WHEN age BETWEEN 50 AND 59 THEN '50–59'
           ELSE '60+'
         END AS bucket,
         COUNT(*) AS count
       FROM (
         SELECT TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) AS age
           FROM employees
          WHERE deleted_at IS NULL AND is_active = 1
       ) t
       GROUP BY bucket
       ORDER BY FIELD(bucket, 'Under 30','30–39','40–49','50–59','60+')`
    ),

    // 6. Gender distribution
    pool.query(
      `SELECT gender, COUNT(*) AS count
         FROM employees
        WHERE deleted_at IS NULL AND is_active = 1
        GROUP BY gender`
    ),

    // 7. Total leave liability (encashable types only, at current daily rate)
    pool.query(
      `SELECT
         COALESCE(SUM(b.balance * (e.monthly_salary / ?)), 0) AS total_liability,
         COUNT(DISTINCT e.id) AS employees_with_liability,
         COALESCE(SUM(b.balance), 0) AS total_encashable_days
       FROM leave_credit_balances b
       JOIN employees e     ON e.id = b.employee_id
       JOIN leave_types lt  ON lt.id = b.leave_type_id
      WHERE lt.is_encashable = 1
        AND lt.is_credited = 1
        AND e.is_active = 1
        AND e.deleted_at IS NULL
        AND e.monthly_salary IS NOT NULL`,
      [WORKING_DAYS_PER_MONTH]
    ),

    // 8. Leave liability broken down per type
    pool.query(
      `SELECT
         lt.code, lt.name, lt.color_hex,
         COUNT(DISTINCT e.id) AS employee_count,
         COALESCE(SUM(b.balance), 0) AS total_days,
         COALESCE(SUM(b.balance * (e.monthly_salary / ?)), 0) AS total_liability
       FROM leave_types lt
       LEFT JOIN leave_credit_balances b ON b.leave_type_id = lt.id
       LEFT JOIN employees e
         ON e.id = b.employee_id
        AND e.is_active = 1
        AND e.deleted_at IS NULL
      WHERE lt.is_encashable = 1
        AND lt.is_credited = 1
        AND lt.deleted_at IS NULL
        AND lt.is_active = 1
      GROUP BY lt.id, lt.code, lt.name, lt.color_hex
      ORDER BY lt.sort_order`,
      [WORKING_DAYS_PER_MONTH]
    ),

    // 9. Attendance compliance for the chosen month
    pool.query(
      `SELECT
         COUNT(*) AS employee_count,
         SUM(CASE WHEN a.tardy_minutes_total <= 60
                   AND a.undertime_minutes_total <= 60
                   AND a.absence_count <= 2 THEN 1 ELSE 0 END) AS compliant,
         SUM(CASE WHEN a.tardy_minutes_total > 60
                   OR a.undertime_minutes_total > 60
                   OR a.absence_count > 2 THEN 1 ELSE 0 END) AS non_compliant,
         COALESCE(SUM(a.tardy_minutes_total), 0) AS total_tardy,
         COALESCE(SUM(a.absence_count), 0) AS total_absences
       FROM attendance_summaries a
       JOIN employees e ON e.id = a.employee_id
      WHERE a.period_year = ?
        AND a.period_month = ?
        AND e.is_active = 1
        AND e.deleted_at IS NULL`,
      [year, month]
    ),

    // 10. Headcount trend over the last 12 months
    pool.query(
      `SELECT
         YEAR(date_hired) AS year,
         MONTH(date_hired) AS month,
         COUNT(*) AS hires
       FROM employees
      WHERE date_hired >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        AND deleted_at IS NULL
      GROUP BY YEAR(date_hired), MONTH(date_hired)
      ORDER BY year ASC, month ASC`
    ),

    // 11. Recent hires (last 90 days)
    pool.query(
      `SELECT e.id, e.employee_number, e.full_name,
              e.date_hired, e.employment_status,
              d.code AS department_code, d.name AS department_name,
              p.title AS position_title
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.date_hired >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          AND e.deleted_at IS NULL
          AND e.is_active = 1
        ORDER BY e.date_hired DESC
        LIMIT 10`
    ),

    // 12. Pending leave applications (all stages)
    pool.query(
      `SELECT
         SUM(CASE WHEN status = 'pending_supervisor' THEN 1 ELSE 0 END) AS pending_supervisor,
         SUM(CASE WHEN status = 'pending_approver'   THEN 1 ELSE 0 END) AS pending_approver,
         SUM(CASE WHEN status IN ('pending_supervisor','pending_approver')
                  THEN 1 ELSE 0 END) AS total_pending
       FROM leave_applications
      WHERE deleted_at IS NULL`
    ),
  ]);

  /* ---------------------------------------------------------------- *
   *  Shape the response
   * ---------------------------------------------------------------- */
  const complianceRow = attendanceCompliance[0];

  return ok(res, {
    period: { year, month, label: `${year}-${String(month).padStart(2, '0')}` },

    headcount: {
      total: Number(headcount[0].total),
      active: Number(headcount[0].active),
      inactive: Number(headcount[0].inactive),
      permanent: Number(headcount[0].permanent),
      nonPermanent: Number(headcount[0].non_permanent),
      separated: Number(headcount[0].separated),
    },

    byStatus: statusRows.map((r) => ({
      status: r.employment_status,
      count: Number(r.count),
    })),

    byDepartment: deptRows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      employeeCount: Number(r.employee_count),
      permanentCount: Number(r.permanent_count),
    })),

    bySalaryGrade: salaryRows.map((r) => ({
      salaryGrade: Number(r.salary_grade),
      count: Number(r.count),
    })),

    byAge: ageRows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
    })),

    byGender: genderRows.map((r) => ({
      gender: r.gender,
      count: Number(r.count),
    })),

    leaveLiability: {
      totalLiability: Number(leaveLiability[0].total_liability),
      employeesWithLiability: Number(leaveLiability[0].employees_with_liability),
      totalEncashableDays: Number(leaveLiability[0].total_encashable_days),
      workingDaysPerMonth: WORKING_DAYS_PER_MONTH,
      byType: leaveLiabilityByType.map((r) => ({
        code: r.code,
        name: r.name,
        colorHex: r.color_hex,
        employeeCount: Number(r.employee_count),
        totalDays: Number(r.total_days),
        totalLiability: Number(r.total_liability),
      })),
    },

    attendance: {
      employeesWithSummary: Number(complianceRow.employee_count),
      compliant: Number(complianceRow.compliant),
      nonCompliant: Number(complianceRow.non_compliant),
      complianceRate: complianceRow.employee_count > 0
        ? Math.round(
            (Number(complianceRow.compliant) / Number(complianceRow.employee_count)) * 1000
          ) / 10
        : null,
      totalTardyMinutes: Number(complianceRow.total_tardy),
      totalAbsenceDays: Number(complianceRow.total_absences),
    },

    hireTrend: monthlyTrend.map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      label: `${r.year}-${String(r.month).padStart(2, '0')}`,
      hires: Number(r.hires),
    })),

    recentHires: recentHires.map((r) => ({
      id: r.id,
      employeeNumber: r.employee_number,
      fullName: r.full_name,
      dateHired: r.date_hired,
      employmentStatus: r.employment_status,
      departmentCode: r.department_code,
      departmentName: r.department_name,
      positionTitle: r.position_title,
    })),

    pendingApprovals: {
      supervisor: Number(pendingApprovals[0].pending_supervisor),
      approver: Number(pendingApprovals[0].pending_approver),
      total: Number(pendingApprovals[0].total_pending),
    },
  });
});

/* ================================================================== *
 *  GET /api/dashboard/my-summary
 *  Employee-facing summary: their own balances, DTR, applications
 * ================================================================== */
export const getMySummary = asyncHandler(async (req, res) => {
  const [emp] = await pool.query(
    'SELECT id, full_name, employee_number FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.id]
  );
  if (!emp[0]) return ok(res, { employeeId: null });

  const employeeId = emp[0].id;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    [balances],
    [attendance],
    [leaveApps],
  ] = await Promise.all([
    pool.query(
      `SELECT lt.code, lt.name, lt.color_hex, b.balance, b.earned_ytd, b.used_ytd
         FROM leave_credit_balances b
         JOIN leave_types lt ON lt.id = b.leave_type_id
        WHERE b.employee_id = ?
        ORDER BY lt.sort_order`,
      [employeeId]
    ),
    pool.query(
      `SELECT period_year, period_month, tardy_minutes_total, undertime_minutes_total,
              absence_count, tardy_count, days_worked, hours_worked_total
         FROM attendance_summaries
        WHERE employee_id = ? AND period_year = ? AND period_month = ?`,
      [employeeId, year, month]
    ),
    pool.query(
      `SELECT
         SUM(CASE WHEN status IN ('pending_supervisor','pending_approver') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' AND YEAR(start_date) = ? THEN 1 ELSE 0 END) AS approved_ytd
       FROM leave_applications
      WHERE employee_id = ? AND deleted_at IS NULL`,
      [year, employeeId]
    ),
  ]);

  return ok(res, {
    employee: {
      id: employeeId,
      fullName: emp[0].full_name,
      employeeNumber: emp[0].employee_number,
    },
    balances: balances.map((r) => ({
      code: r.code,
      name: r.name,
      colorHex: r.color_hex,
      balance: Number(r.balance),
      earnedYtd: Number(r.earned_ytd),
      usedYtd: Number(r.used_ytd),
    })),
    attendance: attendance[0] ? {
      period: `${attendance[0].period_year}-${String(attendance[0].period_month).padStart(2, '0')}`,
      tardyMinutes: Number(attendance[0].tardy_minutes_total),
      undertimeMinutes: Number(attendance[0].undertime_minutes_total),
      absenceCount: Number(attendance[0].absence_count),
      tardyCount: Number(attendance[0].tardy_count),
      daysWorked: Number(attendance[0].days_worked),
      hoursWorked: Number(attendance[0].hours_worked_total),
    } : null,
    leaveApplications: {
      pending: Number(leaveApps[0].pending ?? 0),
      approvedYtd: Number(leaveApps[0].approved_ytd ?? 0),
    },
  });
});