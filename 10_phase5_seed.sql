-- ============================================================================
--  HRMIS — FILE 10 of 12: Report Definitions
--  Idempotent: safe to re-run.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `report_definitions`
  (`code`,`name`,`description`,`module`,`report_type`,
   `handler_key`,`default_filters`,`allowed_export_formats`,
   `required_permission`,`sort_order`,`icon`)
VALUES

  -- ---- Employee / HR reports ---------------------------------------------
  ('EMP_DIRECTORY','Employee Master Directory',
   'Complete listing of all personnel with current position, department, and employment status.',
   'employees','list',
   'employees.directory',
   JSON_OBJECT('activeOnly', 1),
   JSON_ARRAY('csv','pdf'),
   'employees.view', 10, 'Users'),

  ('SERVICE_RECORDS','Service Record Export',
   'Civil Service formatted service record for a single employee — appointments, promotions, and status changes.',
   'documents','document',
   'documents.serviceRecord',
   JSON_OBJECT(),
   JSON_ARRAY('pdf'),
   'service_records.view', 20, 'FileText'),

  ('COE','Certificate of Employment',
   'Official Certificate of Employment for a single employee with purpose and optional salary disclosure.',
   'documents','document',
   'documents.coe',
   JSON_OBJECT('showSalary', 1),
   JSON_ARRAY('pdf'),
   'reports.generate_coe', 30, 'Award'),

  ('HEADCOUNT_BY_DEPT','Headcount by Department',
   'Number of active employees per department, broken down by employment status.',
   'organization','aggregate',
   'org.headcountByDepartment',
   JSON_OBJECT(),
   JSON_ARRAY('csv','pdf'),
   'reports.view', 40, 'Building2'),

  ('HEADCOUNT_BY_STATUS','Headcount by Employment Status',
   'Distribution of personnel across Permanent, Temporary, Contractual, and other statuses.',
   'organization','aggregate',
   'org.headcountByStatus',
   JSON_OBJECT(),
   JSON_ARRAY('csv','pdf'),
   'reports.view', 50, 'PieChart'),

  -- ---- Attendance reports ------------------------------------------------
  ('ATTENDANCE_SUMMARY','Monthly Attendance Summary',
   'Per-employee tardiness, undertime, absences, and hours worked for a chosen month.',
   'attendance','aggregate',
   'attendance.monthlySummary',
   JSON_OBJECT('year', NULL, 'month', NULL),
   JSON_ARRAY('csv','pdf'),
   'attendance.view', 60, 'TrendingDown'),

  ('DTR_COMPLIANCE','DTR Compliance Report',
   'Percentage of employees meeting attendance thresholds per month.',
   'attendance','aggregate',
   'attendance.compliance',
   JSON_OBJECT('year', NULL, 'month', NULL),
   JSON_ARRAY('csv','pdf'),
   'attendance.monitor', 70, 'CheckCircle2'),

  ('ABSENCE_TREND','Absence & Tardiness Trend',
   'Six-month rolling trend of absence days and tardy minutes across the agency.',
   'attendance','aggregate',
   'attendance.absenceTrend',
   JSON_OBJECT('months', 6),
   JSON_ARRAY('csv','pdf'),
   'attendance.monitor', 80, 'Activity'),

  -- ---- Leave reports -----------------------------------------------------
  ('LEAVE_BALANCES','Leave Balance Report',
   'Current leave credit balances for every employee across all credited leave types.',
   'credits','list',
   'credits.balances',
   JSON_OBJECT('departmentId', NULL, 'asOfDate', NULL),
   JSON_ARRAY('csv','pdf'),
   'leave_credits.view', 90, 'Wallet'),

  ('LEAVE_USAGE','Leave Usage Report',
   'Approved leave days consumed per employee, filtered by year and leave type.',
   'leaves','aggregate',
   'leaves.usage',
   JSON_OBJECT('year', NULL, 'leaveTypeId', NULL),
   JSON_ARRAY('csv','pdf'),
   'leave.view', 100, 'CalendarDays'),

  ('LEAVE_LIABILITY','Leave Liability Report',
   'Monetary value of total unused leave credits (VL and SL) at current daily rates.',
   'credits','aggregate',
   'credits.liability',
   JSON_OBJECT('asOfDate', NULL),
   JSON_ARRAY('csv','pdf'),
   'leave_credits.view', 110, 'Banknote'),

  ('PENDING_APPROVALS','Pending Leave Approvals',
   'Applications currently awaiting supervisor or final approver action.',
   'leaves','list',
   'leaves.pendingApprovals',
   JSON_OBJECT(),
   JSON_ARRAY('csv','pdf'),
   'leave.view', 120, 'Clock'),

  -- ---- Audit reports -----------------------------------------------------
  ('AUDIT_RECENT','Recent Activity Log',
   'System events from the last 30 days — who did what, when, and from where.',
   'audit','list',
   'audit.recent',
   JSON_OBJECT('days', 30),
   JSON_ARRAY('csv'),
   'audit_logs.view', 130, 'History'),

  ('AUDIT_CRITICAL','Critical Events Report',
   'Only warning and critical severity events — deletions, permission changes, bulk operations.',
   'audit','list',
   'audit.critical',
   JSON_OBJECT(),
   JSON_ARRAY('csv'),
   'audit_logs.view', 140, 'AlertTriangle'),

  ('AUDIT_USER_ACTIVITY','User Activity Summary',
   'Per-user counts of write actions over a chosen period.',
   'audit','aggregate',
   'audit.userActivity',
   JSON_OBJECT('days', 30),
   JSON_ARRAY('csv'),
   'audit_logs.view', 150, 'UserCheck')

ON DUPLICATE KEY UPDATE
  `name`                   = VALUES(`name`),
  `description`            = VALUES(`description`),
  `default_filters`        = VALUES(`default_filters`),
  `allowed_export_formats` = VALUES(`allowed_export_formats`),
  `required_permission`    = VALUES(`required_permission`),
  `sort_order`             = VALUES(`sort_order`),
  `icon`                   = VALUES(`icon`);