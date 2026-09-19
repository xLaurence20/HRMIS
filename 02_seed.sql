-- ============================================================================
--  HRMIS — FILE 2 of 6: Roles, Permissions, Admin User
-- ============================================================================

-- 8 roles
INSERT IGNORE INTO `roles` (`code`,`role_name`,`description`,`authority_level`,`is_system`) VALUES
  ('ADMIN',      'Administrator',         'System user management, role assignment, master data CRUD', 100, 1),
  ('HR',         'HR Personnel',          'Employee profiles, appointment OCR, Service Record & COE',  80, 1),
  ('ATTENDANCE', 'Attendance Staff',      'DTR ingestion, verification, correction, printing',         70, 1),
  ('LEAVE',      'Leave Staff',           'Leave applications, credit ledgers, TLB computation',       70, 1),
  ('GSIS',       'GSIS Staff',            'GSIS record upload, reconciliation, verification',          60, 1),
  ('REVIEWER',   'Reviewer / Supervisor', 'Review submitted HR transactions, monitor dept logs',       50, 1),
  ('APPROVER',   'Final Approver',        'Executive sign-off for leave, TLB, official transactions',  90, 1),
  ('EMPLOYEE',   'Employee',              'Self-service: profile, DTR summary, service history, leave',10, 1);

-- Permission catalogue
INSERT IGNORE INTO `permissions` (`permission_name`,`module`,`description`) VALUES
  ('profile.view','profile','View own profile'),
  ('profile.update','profile','Update own profile'),
  ('users.view','users','View system users'),
  ('users.create','users','Create system users'),
  ('users.update','users','Edit system users'),
  ('users.delete','users','Soft-delete system users'),
  ('users.assign_roles','users','Assign or revoke user roles'),
  ('users.reset_password','users','Force a password reset'),
  ('roles.view','roles','View roles and their permissions'),
  ('roles.manage_permissions','roles','Edit the role-permission matrix'),
  ('employees.view','employees','View employee master records'),
  ('employees.create','employees','Create employee master records'),
  ('employees.update','employees','Edit employee master records'),
  ('employees.delete','employees','Archive employee master records'),
  ('employees.export','employees','Export employee data'),
  ('departments.view','departments','View departments'),
  ('departments.manage','departments','Create/edit departments'),
  ('positions.view','positions','View plantilla positions'),
  ('positions.manage','positions','Create/edit plantilla positions'),
  ('service_records.view','service_records','View service records'),
  ('service_records.create','service_records','Create service record entries'),
  ('service_records.update','service_records','Edit service record entries'),
  ('service_records.delete','service_records','Delete service record entries'),
  ('service_records.export','service_records','Export service records'),
  ('dtr.view','dtr','View daily time records'),
  ('dtr.upload','dtr','Ingest DTR via CSV/Excel/biometric'),
  ('dtr.verify','dtr','Verify and lock a DTR period'),
  ('dtr.correct','dtr','Apply a DTR correction'),
  ('dtr.print','dtr','Print CS Form No. 48'),
  ('attendance.view','attendance','View attendance summaries'),
  ('attendance.monitor','attendance','View absence/tardiness dashboards'),
  ('attendance.configure_alerts','attendance','Configure absence/tardiness thresholds'),
  ('leave.view','leave','View leave applications'),
  ('leave.apply','leave','File a leave application'),
  ('leave.cancel','leave','Cancel a pending leave application'),
  ('leave.review','leave','Supervisor-level review action'),
  ('leave.approve','leave','Final approval / sign-off on leave'),
  ('leave.reject','leave','Reject a leave application'),
  ('leave_credits.view','leave_credits','View leave credit ledgers'),
  ('leave_credits.adjust','leave_credits','Manual ledger adjustment'),
  ('leave_credits.post_monthly','leave_credits','Run the monthly credit accrual job'),
  ('tlb.view','tlb','View Terminal Leave Benefit computations'),
  ('tlb.process','tlb','Compute TLB monetization'),
  ('tlb.verify','tlb','Verify historical credits for TLB'),
  ('tlb.approve','tlb','Approve TLB monetization claim'),
  ('gsis.view','gsis','View GSIS records'),
  ('gsis.upload','gsis','Upload GSIS records'),
  ('gsis.reconcile','gsis','Reconcile GSIS records'),
  ('gsis.verify','gsis','Mark a GSIS record as verified'),
  ('reports.view','reports','View standard reports'),
  ('reports.generate_coe','reports','Generate Certificate of Employment'),
  ('reports.generate_service_record','reports','Generate Service Record'),
  ('reports.executive_dashboard','reports','View executive analytics dashboard'),
  ('audit_logs.view','audit_logs','Read the system audit trail'),
  ('audit_logs.purge','audit_logs','Archive/purge audit entries'),
  ('settings.view','settings','View system settings'),
  ('settings.manage','settings','Modify system settings');

-- ADMIN gets everything
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`code` = 'ADMIN';

-- HR
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`module` IN ('profile','employees','positions','service_records')
  OR p.`permission_name` IN ('departments.view','dtr.view','leave.view','users.view',
                             'audit_logs.view','reports.view','reports.generate_coe',
                             'reports.generate_service_record')
) WHERE r.`code` = 'HR';

-- ATTENDANCE
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`module` IN ('dtr','attendance')
  OR p.`permission_name` IN ('profile.view','profile.update','employees.view',
                             'departments.view','reports.view','leave.view')
) WHERE r.`code` = 'ATTENDANCE';

-- LEAVE
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`module` IN ('leave','leave_credits','tlb')
  OR p.`permission_name` IN ('profile.view','profile.update','employees.view',
                             'dtr.view','reports.view','audit_logs.view')
) WHERE r.`code` = 'LEAVE';

-- GSIS
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`module` = 'gsis'
  OR p.`permission_name` IN ('profile.view','profile.update','employees.view',
                             'service_records.view','reports.view')
) WHERE r.`code` = 'GSIS';

-- REVIEWER
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`permission_name` LIKE '%.view'
  OR p.`permission_name` IN ('profile.update','leave.review','leave.approve','leave.reject',
                             'dtr.verify','attendance.monitor',
                             'reports.generate_coe','reports.generate_service_record')
) WHERE r.`code` = 'REVIEWER';

-- APPROVER
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON (
     p.`permission_name` LIKE '%.view'
  OR p.`permission_name` IN ('profile.update','leave.approve','leave.reject','tlb.approve',
                             'attendance.monitor','reports.executive_dashboard')
) WHERE r.`code` = 'APPROVER';

-- EMPLOYEE
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p
ON p.`permission_name` IN (
  'profile.view','profile.update','employees.view','service_records.view',
  'dtr.view','attendance.view','leave.view','leave.apply','leave.cancel',
  'leave_credits.view','reports.view'
) WHERE r.`code` = 'EMPLOYEE';

-- Bootstrap admin — REPLACE HASH BELOW
-- Generate: node -e "console.log(require('bcryptjs').hashSync('YourStrongPass2026!',12))"
INSERT INTO `users` (`username`,`email`,`password_hash`,`role_id`,`status`,`profile_completed`,`must_change_password`)
SELECT 'sysadmin','sysadmin@agency.gov.ph',
       '$2a$12$REPLACE_WITH_REAL_BCRYPT_HASH_60_CHARS_LONG_0000000000000000',
       r.`id`, 'active', 0, 1
FROM `roles` r WHERE r.`code` = 'ADMIN'
ON DUPLICATE KEY UPDATE `username` = `username`;

INSERT IGNORE INTO `user_profiles` (`user_id`,`first_name`,`last_name`,`position`)
SELECT u.`id`, 'System', 'Administrator', 'System Administrator'
FROM `users` u WHERE u.`username` = 'sysadmin';