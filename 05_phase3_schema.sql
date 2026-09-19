-- ============================================================================
--  HRMIS — FILE 5 of 6: Attendance Tracking & Logs Management
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `holidays` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `holiday_date`  DATE         NOT NULL,
  `name`          VARCHAR(150) NOT NULL,
  `holiday_type`  ENUM('regular','special_non_working','special_working') NOT NULL,
  `is_recurring`  TINYINT(1)   NOT NULL DEFAULT 0,
  `legal_basis`   VARCHAR(255) NULL,
  `created_by`    BIGINT UNSIGNED NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_holidays_date` (`holiday_date`),
  KEY `idx_holidays_year` (`holiday_date`, `holiday_type`),
  CONSTRAINT `fk_holidays_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dtr_periods` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`   BIGINT UNSIGNED NOT NULL,
  `period_year`   SMALLINT UNSIGNED NOT NULL,
  `period_month`  TINYINT UNSIGNED  NOT NULL,
  `status`        ENUM('draft','submitted','verified','locked') NOT NULL DEFAULT 'draft',
  `submitted_by`  BIGINT UNSIGNED NULL,
  `submitted_at`  DATETIME     NULL,
  `verified_by`   BIGINT UNSIGNED NULL,
  `verified_at`   DATETIME     NULL,
  `locked_by`     BIGINT UNSIGNED NULL,
  `locked_at`     DATETIME     NULL,
  `remarks`       TEXT         NULL,
  `created_by`    BIGINT UNSIGNED NULL,
  `updated_by`    BIGINT UNSIGNED NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dtr_period` (`employee_id`, `period_year`, `period_month`),
  KEY `idx_dtr_period_status`    (`status`),
  KEY `idx_dtr_period_yearmonth` (`period_year`, `period_month`),
  KEY `idx_dtr_period_employee`  (`employee_id`, `period_year` DESC, `period_month` DESC),
  CONSTRAINT `fk_dtr_period_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_period_submitted_by` FOREIGN KEY (`submitted_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_period_verified_by` FOREIGN KEY (`verified_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_period_locked_by` FOREIGN KEY (`locked_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_period_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_period_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_dtr_period_month` CHECK (`period_month` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dtr_logs` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `period_id`          BIGINT UNSIGNED NOT NULL,
  `employee_id`        BIGINT UNSIGNED NOT NULL,
  `log_date`           DATE             NOT NULL,
  `am_arrival`         TIME             NULL,
  `am_departure`       TIME             NULL,
  `pm_arrival`         TIME             NULL,
  `pm_departure`       TIME             NULL,
  `overtime_in`        TIME             NULL,
  `overtime_out`       TIME             NULL,
  `tardiness_minutes`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `undertime_minutes`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `overtime_minutes`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `hours_worked`       DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `is_absent`          TINYINT(1)        NOT NULL DEFAULT 0,
  `is_holiday`         TINYINT(1)        NOT NULL DEFAULT 0,
  `holiday_id`         INT UNSIGNED      NULL,
  `is_leave`           TINYINT(1)        NOT NULL DEFAULT 0,
  `leave_type`         VARCHAR(50)       NULL,
  `leave_hours`        DECIMAL(4,2)      NULL,
  `is_lwop`            TINYINT(1)        NOT NULL DEFAULT 0,
  `source`             ENUM('manual','csv_upload','biometric','system') NOT NULL DEFAULT 'manual',
  `remarks`            VARCHAR(255)      NULL,
  `created_by`         BIGINT UNSIGNED   NULL,
  `updated_by`         BIGINT UNSIGNED   NULL,
  `created_at`         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dtr_log_day` (`employee_id`, `log_date`),
  KEY `idx_dtr_log_period`   (`period_id`, `log_date`),
  KEY `idx_dtr_log_absent`   (`employee_id`, `is_absent`),
  KEY `idx_dtr_log_tardy`    (`employee_id`, `tardiness_minutes`),
  KEY `idx_dtr_log_holiday`  (`is_holiday`),
  CONSTRAINT `fk_dtr_log_period` FOREIGN KEY (`period_id`)
    REFERENCES `dtr_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_log_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_log_holiday` FOREIGN KEY (`holiday_id`)
    REFERENCES `holidays` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_log_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dtr_log_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_summaries` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`              BIGINT UNSIGNED NOT NULL,
  `period_year`              SMALLINT UNSIGNED NOT NULL,
  `period_month`             TINYINT UNSIGNED  NOT NULL,
  `working_days`             DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `days_worked`              DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `days_absent`              DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `days_leave`               DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `days_lwop`                DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tardy_minutes_total`      INT UNSIGNED NOT NULL DEFAULT 0,
  `undertime_minutes_total`  INT UNSIGNED NOT NULL DEFAULT 0,
  `overtime_minutes_total`   INT UNSIGNED NOT NULL DEFAULT 0,
  `hours_worked_total`       DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  `tardy_count`              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `absence_count`            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `computed_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `computed_by`              BIGINT UNSIGNED NULL,
  `notes`                    VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_att_summary` (`employee_id`, `period_year`, `period_month`),
  KEY `idx_att_summary_period`  (`period_year`, `period_month`),
  KEY `idx_att_summary_tardy`   (`tardy_minutes_total`),
  KEY `idx_att_summary_absent`  (`absence_count`),
  CONSTRAINT `fk_att_summary_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_att_summary_computed_by` FOREIGN KEY (`computed_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_att_summary_month` CHECK (`period_month` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_thresholds` (
  `id`                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_id`              INT UNSIGNED NULL,
  `tardy_minutes_monthly`      INT UNSIGNED NOT NULL DEFAULT 60,
  `undertime_minutes_monthly`  INT UNSIGNED NOT NULL DEFAULT 60,
  `absences_monthly`           DECIMAL(4,1) NOT NULL DEFAULT 2.0,
  `is_active`                  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`                 BIGINT UNSIGNED NULL,
  `updated_by`                 BIGINT UNSIGNED NULL,
  `created_at`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_threshold_dept` (`department_id`),
  KEY `idx_threshold_active` (`is_active`),
  CONSTRAINT `fk_threshold_dept` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_threshold_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_threshold_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;