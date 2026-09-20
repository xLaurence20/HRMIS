-- ============================================================================
--  HRMIS — FILE 8 of 10: CSC Leave Types, Accrual Rules, Demo Balances
--  Idempotent: safe to re-run.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- S1. CSC-compliant leave types
-- ---------------------------------------------------------------------------
INSERT INTO `leave_types`
  (`code`,`name`,`short_name`,`description`,`category`,
   `is_paid`,`is_credited`,`is_encashable`,
   `accrual_method`,`accrual_amount`,`max_balance_cap`,
   `max_days_per_request`,`max_days_per_year`,`min_notice_days`,
   `allows_half_day`,`allows_negative_balance`,
   `requires_attachment`,`attachment_hint`,
   `gender_restriction`,`color_hex`,`sort_order`,`legal_basis`)
VALUES
  -- ---- Regular leaves -----------------------------------------------------
  ('VL','Vacation Leave','VL',
   'Vacation leave for personal time off. Earned monthly, carry-over allowed.',
   'regular',
   1, 1, 1,
   'monthly', 1.250, 15.000,
   NULL, NULL, 3,
   1, 0,
   0, NULL,
   NULL, '#3b82f6', 10, 'EO 292, Rule XVI CSC MC 41 s.1998'),

  ('SL','Sick Leave','SL',
   'Sick leave for illness or medical treatment. Earned monthly, uncapped accumulation.',
   'regular',
   1, 1, 0,
   'monthly', 1.250, NULL,
   NULL, NULL, 0,
   1, 1,
   1, 'Medical certificate for absences exceeding 3 consecutive days',
   NULL, '#ef4444', 20, 'EO 292, Rule XVI CSC MC 41 s.1998'),

  -- ---- Special leaves -----------------------------------------------------
  ('SPL','Special Privilege Leave','SPL',
   'Personal milestone leave — birthdays, weddings, anniversaries, graduations.',
   'special',
   1, 1, 0,
   'annual', 3.000, NULL,
   3.00, 3.00, 3,
   1, 0,
   0, NULL,
   NULL, '#8b5cf6', 30, 'CSC MC 6 s.1996'),

  ('SOLO','Solo Parent Leave','SPL-Parent',
   'Special leave benefits for solo parents under RA 8972.',
   'special',
   1, 1, 0,
   'annual', 7.000, NULL,
   7.00, 7.00, 3,
   0, 0,
   1, 'Solo Parent ID or certification from DSWD',
   NULL, '#10b981', 40, 'RA 8972'),

  ('VAWC','VAWC Leave','VAWC',
   'Leave for women victims of violence under RA 9262.',
   'special',
   1, 1, 0,
   'annual', 10.000, NULL,
   10.00, 10.00, 0,
   0, 0,
   1, 'Barangay protection order or certification',
   'Female', '#ec4899', 50, 'RA 9262'),

  -- ---- Maternity / Paternity ---------------------------------------------
  ('MATERNITY','Maternity Leave','MAT',
   'Paid maternity leave for female employees (live childbirth).',
   'maternity',
   1, 0, 0,
   'one_time', 105.000, NULL,
   105.00, NULL, 0,
   0, 0,
   1, 'Medical certificate or birth certificate',
   'Female', '#f59e0b', 60, 'RA 11210'),

  ('MATERNITY_MISCARRIAGE','Maternity Leave (Miscarriage)','MAT-MC',
   'Paid maternity leave for miscarriage or emergency termination of pregnancy.',
   'maternity',
   1, 0, 0,
   'one_time', 60.000, NULL,
   60.00, NULL, 0,
   0, 0,
   1, 'Medical certificate',
   'Female', '#f59e0b', 65, 'RA 11210'),

  ('PATERNITY','Paternity Leave','PAT',
   'Paid paternity leave for married male employees for first 4 deliveries.',
   'paternity',
   1, 0, 0,
   'one_time', 7.000, NULL,
   7.00, NULL, 0,
   0, 0,
   1, 'Marriage certificate + birth certificate',
   'Male', '#06b6d4', 70, 'RA 8187'),

  -- ---- Study / Rehabilitation --------------------------------------------
  ('STUDY','Study Leave','STUDY',
   'Study leave for taking bar/board exams or completing graduate studies.',
   'study',
   1, 0, 0,
   'manual_only', 0.000, NULL,
   180.00, NULL, 30,
   0, 0,
   1, 'Proof of exam / enrolment',
   NULL, '#6366f1', 80, 'CSC MC 21 s.1993'),

  ('REHAB','Rehabilitation Privilege','REHAB',
   'Medical rehabilitation leave for work-related injuries or illnesses.',
   'rehabilitation',
   1, 0, 0,
   'manual_only', 0.000, NULL,
   180.00, NULL, 0,
   0, 0,
   1, 'Medical certificate from attending physician',
   NULL, '#14b8a6', 90, 'CSC MC 6 s.2002'),

  -- ---- Unpaid ------------------------------------------------------------
  ('LWOP','Leave Without Pay','LWOP',
   'Unpaid leave for personal reasons when credits are exhausted.',
   'unpaid',
   0, 0, 0,
   'manual_only', 0.000, NULL,
   NULL, NULL, 3,
   0, 0,
   0, NULL,
   NULL, '#64748b', 100, 'CSC MC 41 s.1998')

ON DUPLICATE KEY UPDATE
  `name`            = VALUES(`name`),
  `description`     = VALUES(`description`),
  `accrual_method`  = VALUES(`accrual_method`),
  `accrual_amount`  = VALUES(`accrual_amount`),
  `is_credited`     = VALUES(`is_credited`),
  `is_encashable`   = VALUES(`is_encashable`),
  `color_hex`       = VALUES(`color_hex`),
  `sort_order`      = VALUES(`sort_order`);


-- ---------------------------------------------------------------------------
-- S2. Demo opening balances for the three seed employees
--     Creates opening_balance ledger entries + populates balances.
--     Idempotent: skips employees who already have a balance row.
-- ---------------------------------------------------------------------------

-- VL opening balances
INSERT INTO `leave_credit_ledgers`
  (`employee_id`, `leave_type_id`, `effective_date`,
   `transaction_type`, `amount`, `running_balance`,
   `reference_type`, `remarks`)
SELECT
  e.`id`, lt.`id`, '2026-01-01',
  'opening_balance', bal.vl, bal.vl,
  'system', 'Seed opening VL balance'
FROM `employees` e
JOIN `leave_types` lt ON lt.`code` = 'VL'
JOIN (
  SELECT 'EMP-0001' AS num, 12.500 AS vl,  8.250 AS sl UNION ALL
  SELECT 'EMP-0002', 6.250, 6.250 UNION ALL
  SELECT 'EMP-0003', 15.000, 11.750
) bal ON bal.num = e.`employee_number`
WHERE NOT EXISTS (
  SELECT 1 FROM `leave_credit_ledgers` lcl
   WHERE lcl.`employee_id` = e.`id`
     AND lcl.`leave_type_id` = lt.`id`
     AND lcl.`transaction_type` = 'opening_balance'
);

-- SL opening balances
INSERT INTO `leave_credit_ledgers`
  (`employee_id`, `leave_type_id`, `effective_date`,
   `transaction_type`, `amount`, `running_balance`,
   `reference_type`, `remarks`)
SELECT
  e.`id`, lt.`id`, '2026-01-01',
  'opening_balance', bal.sl, bal.sl,
  'system', 'Seed opening SL balance'
FROM `employees` e
JOIN `leave_types` lt ON lt.`code` = 'SL'
JOIN (
  SELECT 'EMP-0001' AS num, 8.250 AS sl UNION ALL
  SELECT 'EMP-0002', 6.250 UNION ALL
  SELECT 'EMP-0003', 11.750
) bal ON bal.num = e.`employee_number`
WHERE NOT EXISTS (
  SELECT 1 FROM `leave_credit_ledgers` lcl
   WHERE lcl.`employee_id` = e.`id`
     AND lcl.`leave_type_id` = lt.`id`
     AND lcl.`transaction_type` = 'opening_balance'
);

-- SPL opening balances (3 days/year, given upfront)
INSERT INTO `leave_credit_ledgers`
  (`employee_id`, `leave_type_id`, `effective_date`,
   `transaction_type`, `amount`, `running_balance`,
   `reference_type`, `remarks`)
SELECT
  e.`id`, lt.`id`, '2026-01-01',
  'opening_balance', 3.000, 3.000,
  'system', 'Seed SPL balance for current year'
FROM `employees` e
JOIN `leave_types` lt ON lt.`code` = 'SPL'
WHERE NOT EXISTS (
  SELECT 1 FROM `leave_credit_ledgers` lcl
   WHERE lcl.`employee_id` = e.`id`
     AND lcl.`leave_type_id` = lt.`id`
     AND lcl.`transaction_type` = 'opening_balance'
);

-- Populate balances from the ledger (idempotent upsert)
INSERT INTO `leave_credit_balances`
  (`employee_id`, `leave_type_id`, `balance`, `earned_ytd`, `used_ytd`,
   `last_transaction_id`, `last_transaction_at`)
SELECT
  lcl.`employee_id`,
  lcl.`leave_type_id`,
  SUM(lcl.`amount`) AS balance,
  SUM(CASE WHEN lcl.`amount` > 0 THEN lcl.`amount` ELSE 0 END) AS earned_ytd,
  SUM(CASE WHEN lcl.`amount` < 0 THEN -lcl.`amount` ELSE 0 END) AS used_ytd,
  MAX(lcl.`id`) AS last_id,
  MAX(lcl.`posted_at`) AS last_at
FROM `leave_credit_ledgers` lcl
GROUP BY lcl.`employee_id`, lcl.`leave_type_id`
ON DUPLICATE KEY UPDATE
  `balance`             = VALUES(`balance`),
  `earned_ytd`          = VALUES(`earned_ytd`),
  `used_ytd`            = VALUES(`used_ytd`),
  `last_transaction_id` = VALUES(`last_transaction_id`),
  `last_transaction_at` = VALUES(`last_transaction_at`);


-- ---------------------------------------------------------------------------
-- S3. Initialize number sequences for the current year
-- ---------------------------------------------------------------------------
INSERT INTO `leave_application_number_seq` (`year`, `last_number`)
VALUES (YEAR(CURDATE()), 0)
ON DUPLICATE KEY UPDATE `year` = `year`;