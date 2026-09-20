-- ============================================================================
--  HRMIS — FILE 7 of 10: Leave Management & Approval Engine
--  MariaDB 10.4+ / MySQL 8 | utf8mb4_unicode_ci
--  Run AFTER 05_phase3_schema.sql and 06_phase3_seed.sql.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ############################################################################
-- ## 4.1  leave_types                                                       ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_types` (
  `id`                    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                  VARCHAR(30)  NOT NULL COMMENT 'VL, SL, SPL, MATERNITY...',
  `name`                  VARCHAR(120) NOT NULL,
  `short_name`            VARCHAR(40)  NULL,
  `description`           VARCHAR(500) NULL,

  `category`              ENUM('regular','special','maternity','paternity',
                               'study','rehabilitation','unpaid','other')
                          NOT NULL DEFAULT 'special',

  -- Payment / balance semantics
  `is_paid`               TINYINT(1)   NOT NULL DEFAULT 1,
  `is_credited`           TINYINT(1)   NOT NULL DEFAULT 1
                          COMMENT '0 = no credit balance tracked (e.g. LWOP)',
  `is_encashable`         TINYINT(1)   NOT NULL DEFAULT 0
                          COMMENT 'Only VL is typically encashable',

  -- Accrual
  `accrual_method`        ENUM('monthly','annual','one_time','manual_only')
                          NOT NULL DEFAULT 'manual_only',
  `accrual_amount`        DECIMAL(6,3) NOT NULL DEFAULT 0.000
                          COMMENT 'Days per month or per year, per accrual_method',
  `max_balance_cap`       DECIMAL(7,3) NULL
                          COMMENT 'NULL = uncapped (e.g. SL); VL often capped at 15+carryover',

  -- Application rules
  `max_days_per_request`  DECIMAL(5,2) NULL COMMENT 'NULL = no limit',
  `max_days_per_year`     DECIMAL(5,2) NULL COMMENT 'NULL = no annual limit',
  `min_notice_days`       SMALLINT UNSIGNED NOT NULL DEFAULT 0
                          COMMENT 'For planned leaves; 0 = can file same day',
  `allows_half_day`       TINYINT(1)   NOT NULL DEFAULT 1,
  `allows_negative_balance` TINYINT(1) NOT NULL DEFAULT 0
                          COMMENT 'SL permits negative balance in CSC practice',
  `requires_attachment`   TINYINT(1)   NOT NULL DEFAULT 0
                          COMMENT '1 = medical cert, marriage cert, etc.',
  `attachment_hint`       VARCHAR(200) NULL,

  -- Eligibility
  `gender_restriction`    ENUM('Male','Female') NULL
                          COMMENT 'Maternity = Female, Paternity = Male',

  -- Presentation
  `color_hex`             CHAR(7)      NULL DEFAULT '#3b82f6',
  `sort_order`            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `is_active`             TINYINT(1)   NOT NULL DEFAULT 1,

  -- Legal / audit
  `legal_basis`           VARCHAR(255) NULL,
  `created_by`            BIGINT UNSIGNED NULL,
  `updated_by`            BIGINT UNSIGNED NULL,
  `created_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`            DATETIME     NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leave_types_code` (`code`),
  KEY `idx_leave_types_active` (`is_active`, `deleted_at`),
  KEY `idx_leave_types_sort`   (`sort_order`),
  CONSTRAINT `fk_leave_types_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_types_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catalogue of leave types with accrual rules';


-- ############################################################################
-- ## 4.2  leave_credit_ledgers  (immutable append-only transaction log)     ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_credit_ledgers` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`        BIGINT UNSIGNED NOT NULL,
  `leave_type_id`      SMALLINT UNSIGNED NOT NULL,

  -- When the transaction affects the balance
  `effective_date`     DATE         NOT NULL
                       COMMENT 'Period the transaction belongs to',
  `posted_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                       COMMENT 'Wall-clock time row was inserted',

  -- What happened
  `transaction_type`   ENUM(
                         'opening_balance',
                         'accrual',
                         'deduction',
                         'adjustment_add',
                         'adjustment_deduct',
                         'expiry',
                         'conversion',
                         'encashment'
                       ) NOT NULL,

  -- Signed amount: positive = credit, negative = debit.
  -- Stored with 3 decimals to support 0.125-day accruals if ever needed.
  `amount`             DECIMAL(7,3) NOT NULL,

  -- Balance snapshot AFTER this transaction (denormalized for fast reads)
  `running_balance`    DECIMAL(8,3) NOT NULL,

  -- Where it came from (nullable for system-generated accruals)
  `reference_type`     ENUM('leave_application','manual','system','tl_b_en ro') NOT NULL
                       DEFAULT 'system',
  `reference_id`       BIGINT UNSIGNED NULL
                       COMMENT 'leave_applications.id when applicable',

  `remarks`            VARCHAR(500) NULL,

  -- Who triggered it (NULL = automated accrual job)
  `created_by`         BIGINT UNSIGNED NULL,

  PRIMARY KEY (`id`),
  KEY `idx_lcl_employee_type`  (`employee_id`, `leave_type_id`, `effective_date`),
  KEY `idx_lcl_effective`      (`effective_date`),
  KEY `idx_lcl_type`           (`transaction_type`),
  KEY `idx_lcl_reference`      (`reference_type`, `reference_id`),
  CONSTRAINT `fk_lcl_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lcl_leave_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_lcl_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_lcl_amount_nonzero` CHECK (`amount` <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only leave credit transaction log — never UPDATE, never DELETE';


-- ############################################################################
-- ## 4.3  leave_credit_balances  (running total per employee per type)      ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_credit_balances` (
  `id`                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`            BIGINT UNSIGNED NOT NULL,
  `leave_type_id`          SMALLINT UNSIGNED NOT NULL,

  `balance`                DECIMAL(8,3) NOT NULL DEFAULT 0.000
                           COMMENT 'Current available credits (days)',
  `earned_ytd`             DECIMAL(7,3) NOT NULL DEFAULT 0.000
                           COMMENT 'Sum of positive transactions this calendar year',
  `used_ytd`               DECIMAL(7,3) NOT NULL DEFAULT 0.000
                           COMMENT 'Sum of negative transactions this calendar year',
  `last_transaction_id`    BIGINT UNSIGNED NULL,
  `last_transaction_at`    DATETIME NULL,

  `created_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lcb_emp_type` (`employee_id`, `leave_type_id`),
  KEY `idx_lcb_employee`  (`employee_id`),
  KEY `idx_lcb_low`       (`balance`),
  CONSTRAINT `fk_lcb_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lcb_leave_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_lcb_last_txn` FOREIGN KEY (`last_transaction_id`)
    REFERENCES `leave_credit_ledgers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Denormalized current balance per employee/type — rebuilt from ledger';


-- ############################################################################
-- ## 4.4  leave_applications                                                ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_applications` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_number`    VARCHAR(30)  NOT NULL
                          COMMENT 'Auto-generated: LV-2026-0001',

  -- Who + which type
  `employee_id`           BIGINT UNSIGNED NOT NULL,
  `leave_type_id`         SMALLINT UNSIGNED NOT NULL,

  -- When filed
  `filed_at`              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `filed_by_user_id`      BIGINT UNSIGNED NULL
                          COMMENT 'NULL = self-filed; set if filed by HR on behalf',

  -- When the leave is taken
  `start_date`            DATE         NOT NULL,
  `end_date`              DATE         NOT NULL,
  `start_half`            ENUM('AM','PM') NULL
                          COMMENT 'Set only for half-day leaves on start_date',
  `end_half`              ENUM('AM','PM') NULL
                          COMMENT 'Set only for half-day leaves on end_date',
  `total_days`            DECIMAL(5,2) NOT NULL
                          COMMENT 'Computed at filing; 0.5 for half-day',
  `total_hours`           DECIMAL(6,2) NULL,

  -- Payment / nature
  `is_with_pay`           TINYINT(1)   NOT NULL DEFAULT 1,

  -- Why
  `reason`                TEXT         NULL,
  `attachment_path`       VARCHAR(255) NULL
                          COMMENT 'Medical cert, marriage contract, etc.',

  -- Contact info during leave (CSC Form 6 field)
  `contact_address`       VARCHAR(255) NULL,
  `contact_phone`         VARCHAR(30)  NULL,

  -- Approval state machine
  `status`                ENUM(
                           'draft',
                           'pending_supervisor',
                           'pending_approver',
                           'approved',
                           'rejected',
                           'cancelled'
                         ) NOT NULL DEFAULT 'draft',

  -- Resolved approvers (snapshot at filing)
  `supervisor_id`         BIGINT UNSIGNED NULL
                          COMMENT 'Employee who reviews at stage 1 (NULL = skip)',
  `approver_id`           BIGINT UNSIGNED NULL
                          COMMENT 'User who gives final sign-off (NULL = any approver)',

  -- Timestamps for each stage
  `supervisor_action_at`  DATETIME     NULL,
  `approver_action_at`    DATETIME     NULL,
  `approved_at`           DATETIME     NULL
                          COMMENT 'Set when final approval completes',
  `rejected_at`           DATETIME     NULL,

  -- Credit commit tracking (set at final approval)
  `credit_committed`      TINYINT(1)   NOT NULL DEFAULT 0
                          COMMENT '1 = credits deducted from ledger',
  `credit_committed_at`   DATETIME     NULL,
  `credit_days_deducted`  DECIMAL(5,2) NULL
                          COMMENT 'Snapshot of total_days when deducted',

  -- Cancellation
  `cancelled_by`          BIGINT UNSIGNED NULL,
  `cancelled_at`          DATETIME     NULL,
  `cancelled_reason`      VARCHAR(500) NULL,

  -- Audit
  `created_by`            BIGINT UNSIGNED NULL,
  `updated_by`            BIGINT UNSIGNED NULL,
  `created_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`            DATETIME     NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leave_app_number` (`application_number`),
  KEY `idx_la_employee`   (`employee_id`, `status`),
  KEY `idx_la_status`     (`status`),
  KEY `idx_la_dates`      (`start_date`, `end_date`),
  KEY `idx_la_supervisor` (`supervisor_id`, `status`)
                          COMMENT 'Powers supervisor approval inbox',
  KEY `idx_la_approver`   (`approver_id`, `status`)
                          COMMENT 'Powers approver approval inbox',
  KEY `idx_la_type`       (`leave_type_id`),
  CONSTRAINT `fk_la_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_la_leave_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_la_filed_by` FOREIGN KEY (`filed_by_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_la_supervisor` FOREIGN KEY (`supervisor_id`)
    REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_la_approver` FOREIGN KEY (`approver_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_la_cancelled_by` FOREIGN KEY (`cancelled_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_la_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_la_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_la_dates`   CHECK (`end_date` >= `start_date`),
  CONSTRAINT `chk_la_days`    CHECK (`total_days` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Leave applications with multi-tier approval workflow';


-- ############################################################################
-- ## 4.5  leave_application_actions  (append-only audit trail)              ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_application_actions` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`  BIGINT UNSIGNED NOT NULL,

  -- Who did it
  `actor_user_id`   BIGINT UNSIGNED NULL,
  `actor_role_code` VARCHAR(30)  NULL
                    COMMENT 'Snapshot of actor role at the time of action',
  `actor_stage`     ENUM('filed','supervisor','approver','system') NOT NULL,

  -- What they did
  `action`          ENUM(
                      'filed',
                      'recommended',
                      'approved',
                      'rejected',
                      'returned',
                      'cancelled',
                      'reopened',
                      'credit_committed',
                      'credit_reversed'
                    ) NOT NULL,

  `remarks`         VARCHAR(500) NULL,
  `acted_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Optional bookkeeping
  `previous_status` VARCHAR(30)  NULL,
  `new_status`      VARCHAR(30)  NULL,

  PRIMARY KEY (`id`),
  KEY `idx_laa_application` (`application_id`, `acted_at`),
  KEY `idx_laa_actor`       (`actor_user_id`),
  CONSTRAINT `fk_laa_application` FOREIGN KEY (`application_id`)
    REFERENCES `leave_applications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_laa_actor` FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit log of every leave application action';


-- ############################################################################
-- ## 4.6  leave_application_number_seq  (per-year counter for LV-YYYY-NNNN) ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `leave_application_number_seq` (
  `year`         SMALLINT UNSIGNED NOT NULL,
  `last_number`  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-year counter for leave application numbers';


SET FOREIGN_KEY_CHECKS = 1;


-- ############################################################################
-- ## 4.7  Convenience views                                                 ##
-- ############################################################################

-- Full application rows with joined employee + type info (used by list/inbox)
CREATE OR REPLACE VIEW `v_leave_applications_full` AS
SELECT
  la.`id`,
  la.`application_number`,
  la.`employee_id`,
  e.`employee_number`,
  e.`full_name`              AS `employee_name`,
  e.`department_id`,
  d.`code`                   AS `department_code`,
  d.`name`                   AS `department_name`,
  e.`position_id`,
  p.`title`                  AS `position_title`,

  la.`leave_type_id`,
  lt.`code`                  AS `leave_type_code`,
  lt.`name`                  AS `leave_type_name`,
  lt.`color_hex`             AS `leave_type_color`,
  lt.`is_credited`           AS `leave_type_is_credited`,
  lt.`requires_attachment`   AS `leave_type_requires_attachment`,

  la.`start_date`,
  la.`end_date`,
  la.`start_half`,
  la.`end_half`,
  la.`total_days`,
  la.`is_with_pay`,
  la.`reason`,
  la.`attachment_path`,
  la.`contact_address`,
  la.`contact_phone`,

  la.`status`,
  la.`supervisor_id`,
  sup.`full_name`            AS `supervisor_name`,
  la.`approver_id`,
  apr.`username`             AS `approver_username`,

  la.`filed_at`,
  la.`filed_by_user_id`,
  fbu.`username`             AS `filed_by_username`,
  la.`supervisor_action_at`,
  la.`approver_action_at`,
  la.`approved_at`,
  la.`rejected_at`,
  la.`credit_committed`,
  la.`credit_committed_at`,
  la.`credit_days_deducted`,
  la.`cancelled_at`,
  la.`cancelled_reason`,

  la.`created_at`,
  la.`updated_at`

FROM `leave_applications` la
JOIN `employees`      e   ON e.`id`  = la.`employee_id`
LEFT JOIN `departments` d  ON d.`id`  = e.`department_id`
LEFT JOIN `positions`   p  ON p.`id`  = e.`position_id`
JOIN `leave_types`    lt  ON lt.`id` = la.`leave_type_id`
LEFT JOIN `employees` sup ON sup.`id` = la.`supervisor_id`
LEFT JOIN `users`     apr ON apr.`id` = la.`approver_id`
LEFT JOIN `users`     fbu ON fbu.`id` = la.`filed_by_user_id`
WHERE la.`deleted_at` IS NULL;


-- Employee × leave-type current balances with employee name and type code
CREATE OR REPLACE VIEW `v_leave_balances_full` AS
SELECT
  b.`id`,
  b.`employee_id`,
  e.`employee_number`,
  e.`full_name`              AS `employee_name`,
  e.`department_id`,
  d.`code`                   AS `department_code`,
  d.`name`                   AS `department_name`,
  b.`leave_type_id`,
  lt.`code`                  AS `leave_type_code`,
  lt.`name`                  AS `leave_type_name`,
  lt.`is_credited`,
  lt.`color_hex`,
  b.`balance`,
  b.`earned_ytd`,
  b.`used_ytd`,
  b.`last_transaction_at`,
  b.`updated_at`
FROM `leave_credit_balances` b
JOIN `employees`   e  ON e.`id`  = b.`employee_id`
LEFT JOIN `departments` d ON d.`id` = e.`department_id`
JOIN `leave_types` lt ON lt.`id` = b.`leave_type_id`;