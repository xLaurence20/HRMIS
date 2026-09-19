-- ============================================================================
--  HRMIS — FILE 3 of 6: Master Records & Personnel Management
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

-- Extend departments
ALTER TABLE `departments`
  ADD COLUMN `short_name`       VARCHAR(50)   NULL     AFTER `name`,
  ADD COLUMN `parent_id`        INT UNSIGNED  NULL     AFTER `short_name`,
  ADD COLUMN `office_type`      ENUM('department','division','section','unit')
                                NOT NULL DEFAULT 'department' AFTER `parent_id`,
  ADD COLUMN `head_employee_id` BIGINT UNSIGNED NULL   AFTER `office_type`,
  ADD COLUMN `cost_center`      VARCHAR(50)   NULL,
  ADD COLUMN `location`         VARCHAR(150)  NULL,
  ADD COLUMN `sort_order`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `created_by`       BIGINT UNSIGNED NULL,
  ADD COLUMN `updated_by`       BIGINT UNSIGNED NULL,
  ADD COLUMN `updated_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN `deleted_at`       DATETIME      NULL;

ALTER TABLE `departments`
  ADD KEY `idx_dept_parent` (`parent_id`),
  ADD KEY `idx_dept_active` (`is_active`, `deleted_at`),
  ADD KEY `idx_dept_type`   (`office_type`);

ALTER TABLE `departments`
  ADD CONSTRAINT `fk_dept_parent` FOREIGN KEY (`parent_id`)
    REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- positions
CREATE TABLE `positions` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`             VARCHAR(40)  NOT NULL,
  `title`            VARCHAR(200) NOT NULL,
  `department_id`    INT UNSIGNED NULL,
  `salary_grade`     TINYINT UNSIGNED NULL,
  `step`             TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `position_class`   ENUM('Executive/Managerial','Professional','Sub-professional','Rank-and-File','Legislative') NULL,
  `level`            ENUM('1st Level','2nd Level','3rd Level') NULL,
  `is_plantilla`     TINYINT(1)   NOT NULL DEFAULT 1,
  `is_supervisory`   TINYINT(1)   NOT NULL DEFAULT 0,
  `is_teaching`      TINYINT(1)   NOT NULL DEFAULT 0,
  `monthly_rate`     DECIMAL(12,2) NULL,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT UNSIGNED NULL,
  `updated_by`       BIGINT UNSIGNED NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`       DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_positions_code`  (`code`),
  KEY `idx_positions_dept`        (`department_id`),
  KEY `idx_positions_title`       (`title`),
  KEY `idx_positions_sg`          (`salary_grade`),
  KEY `idx_positions_active`      (`is_active`, `deleted_at`),
  CONSTRAINT `fk_positions_dept` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_positions_sg`   CHECK (`salary_grade` IS NULL OR `salary_grade` BETWEEN 1 AND 33),
  CONSTRAINT `chk_positions_step` CHECK (`step` BETWEEN 1 AND 8)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- employees
CREATE TABLE `employees` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_number` VARCHAR(30)  NOT NULL,
  `user_id`         BIGINT UNSIGNED NULL,
  `last_name`       VARCHAR(80)  NOT NULL,
  `first_name`      VARCHAR(80)  NOT NULL,
  `middle_name`     VARCHAR(80)  NULL,
  `name_extension`  VARCHAR(20)  NULL,
  `full_name`       VARCHAR(255) AS (
                      CONCAT_WS(', ', `last_name`,
                        CONCAT_WS(' ', `first_name`, `middle_name`, `name_extension`))
                    ) STORED,
  `gender`          ENUM('Male','Female') NOT NULL,
  `birth_date`      DATE         NOT NULL,
  `birth_place`     VARCHAR(200) NULL,
  `civil_status`    ENUM('Single','Married','Widowed','Separated','Annulled','Other') NULL,
  `citizenship`     VARCHAR(60)  NOT NULL DEFAULT 'Filipino',
  `blood_type`      VARCHAR(5)   NULL,
  `height_cm`       DECIMAL(5,2) NULL,
  `weight_kg`       DECIMAL(5,2) NULL,
  `religion`        VARCHAR(80)  NULL,
  `mobile_no`       VARCHAR(20)  NULL,
  `telephone_no`    VARCHAR(20)  NULL,
  `personal_email`  VARCHAR(150) NULL,
  `addr_house_no`          VARCHAR(60)  NULL,
  `addr_street`            VARCHAR(150) NULL,
  `addr_barangay`          VARCHAR(100) NULL,
  `addr_city_municipality` VARCHAR(100) NULL,
  `addr_province`          VARCHAR(100) NULL,
  `addr_region`            VARCHAR(100) NULL,
  `addr_zip_code`          VARCHAR(10)  NULL,
  `gsis_no`         VARCHAR(30)  NULL,
  `pagibig_no`      VARCHAR(30)  NULL,
  `philhealth_no`   VARCHAR(30)  NULL,
  `sss_no`          VARCHAR(30)  NULL,
  `tin`             VARCHAR(30)  NULL,
  `agency_employee_no` VARCHAR(30) NULL,
  `department_id`     INT UNSIGNED NULL,
  `position_id`       INT UNSIGNED NULL,
  `supervisor_id`     BIGINT UNSIGNED NULL,
  `employment_status` ENUM('Permanent','Temporary','Coterminous','Casual',
                           'Contractual','Job Order','Contract of Service',
                           'Substitute','Provisional','Emergency',
                           'Separated','Retired') NOT NULL DEFAULT 'Permanent',
  `date_hired`        DATE         NULL,
  `date_regularized`  DATE         NULL,
  `date_separated`    DATE         NULL,
  `separation_reason` VARCHAR(150) NULL,
  `salary_grade`      TINYINT UNSIGNED NULL,
  `step_increment`    TINYINT UNSIGNED NULL,
  `monthly_salary`    DECIMAL(12,2) NULL,
  `is_active`         TINYINT(1)   NOT NULL DEFAULT 1,
  `photo_path`      VARCHAR(255) NULL,
  `signature_path`  VARCHAR(255) NULL,
  `created_by`      BIGINT UNSIGNED NULL,
  `updated_by`      BIGINT UNSIGNED NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_number`  (`employee_number`),
  UNIQUE KEY `uq_emp_user`    (`user_id`),
  KEY `idx_emp_name`          (`last_name`, `first_name`),
  KEY `idx_emp_dept`          (`department_id`, `is_active`),
  KEY `idx_emp_position`      (`position_id`),
  KEY `idx_emp_status`        (`employment_status`, `is_active`),
  KEY `idx_emp_supervisor`    (`supervisor_id`),
  CONSTRAINT `fk_emp_user`       FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_emp_dept`       FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_emp_position`   FOREIGN KEY (`position_id`)
    REFERENCES `positions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_emp_supervisor` FOREIGN KEY (`supervisor_id`)
    REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_emp_sg`   CHECK (`salary_grade` IS NULL OR `salary_grade` BETWEEN 1 AND 33),
  CONSTRAINT `chk_emp_step` CHECK (`step_increment` IS NULL OR `step_increment` BETWEEN 1 AND 8)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `departments`
  ADD CONSTRAINT `fk_dept_head` FOREIGN KEY (`head_employee_id`)
    REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `departments`
  ADD KEY `idx_dept_head` (`head_employee_id`);

-- service_records
CREATE TABLE `service_records` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`     BIGINT UNSIGNED NOT NULL,
  `sequence_no`     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `record_type`     ENUM('Original Appointment','Promotion','Step Increment','Transfer',
                         'Reassignment','Detail','Designation','Salary Adjustment',
                         'Reinstatement','Contract Renewal','Separation','Retirement',
                         'Resignation','Drop from Rolls','Others') NOT NULL,
  `from_date`       DATE NOT NULL,
  `to_date`         DATE NULL,
  `is_present`      TINYINT(1) NOT NULL DEFAULT 0,
  `position_title`  VARCHAR(200) NOT NULL,
  `position_id`     INT UNSIGNED NULL,
  `department_id`   INT UNSIGNED NULL,
  `department_name` VARCHAR(200) NULL,
  `agency`          VARCHAR(200) NULL,
  `salary_grade`    TINYINT UNSIGNED NULL,
  `step_increment`  TINYINT UNSIGNED NULL,
  `monthly_salary`  DECIMAL(12,2) NULL,
  `appointment_type` ENUM('Permanent','Temporary','Coterminous','Casual','Contractual',
                          'Job Order','Contract of Service','Substitute','Provisional','Emergency') NULL,
  `appointment_status` ENUM('Active','Inactive','Cancelled') NOT NULL DEFAULT 'Active',
  `leave_without_pay` TINYINT(1) NOT NULL DEFAULT 0,
  `legal_basis`     VARCHAR(255) NULL,
  `document_ref`    VARCHAR(100) NULL,
  `document_path`   VARCHAR(255) NULL,
  `ocr_confidence`  DECIMAL(5,2) NULL,
  `verified_by`     BIGINT UNSIGNED NULL,
  `verified_at`     DATETIME NULL,
  `remarks`         TEXT NULL,
  `created_by`      BIGINT UNSIGNED NULL,
  `updated_by`      BIGINT UNSIGNED NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sr_employee`   (`employee_id`, `from_date`),
  KEY `idx_sr_type`       (`record_type`),
  KEY `idx_sr_department` (`department_id`, `from_date`),
  KEY `idx_sr_present`    (`employee_id`, `is_present`),
  CONSTRAINT `fk_sr_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sr_position` FOREIGN KEY (`position_id`)
    REFERENCES `positions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sr_department` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sr_verified_by` FOREIGN KEY (`verified_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Supporting tables
CREATE TABLE `employee_education` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`    BIGINT UNSIGNED NOT NULL,
  `level`          ENUM('Elementary','Secondary','Vocational/Trade Course','College','Masteral','Doctoral') NOT NULL,
  `school_name`    VARCHAR(200) NOT NULL,
  `degree_course`  VARCHAR(200) NULL,
  `year_from`      SMALLINT UNSIGNED NULL,
  `year_to`        SMALLINT UNSIGNED NULL,
  `highest_level_units` VARCHAR(100) NULL,
  `year_graduated` SMALLINT UNSIGNED NULL,
  `honors`         VARCHAR(150) NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_edu_employee` (`employee_id`, `level`),
  CONSTRAINT `fk_edu_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `employee_eligibility` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`         BIGINT UNSIGNED NOT NULL,
  `eligibility_name`    VARCHAR(200) NOT NULL,
  `rating`              VARCHAR(20)  NULL,
  `date_taken`          DATE         NULL,
  `place_taken`         VARCHAR(200) NULL,
  `license_no`          VARCHAR(50)  NULL,
  `license_valid_until` DATE         NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_elig_employee` (`employee_id`),
  KEY `idx_elig_license`  (`license_valid_until`),
  CONSTRAINT `fk_elig_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `employee_trainings` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`     BIGINT UNSIGNED NOT NULL,
  `title`           VARCHAR(250) NOT NULL,
  `conducted_by`    VARCHAR(200) NULL,
  `level`           ENUM('Managerial','Supervisory','Technical','Foundation','Specialized','Others') NULL,
  `date_from`       DATE NULL,
  `date_to`         DATE NULL,
  `hours`           DECIMAL(7,2) NULL,
  `certificate_path` VARCHAR(255) NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_train_employee` (`employee_id`, `date_from`),
  CONSTRAINT `fk_train_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `employee_dependents` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`    BIGINT UNSIGNED NOT NULL,
  `full_name`      VARCHAR(200) NOT NULL,
  `relationship`   ENUM('Spouse','Son','Daughter','Father','Mother','Other') NOT NULL,
  `birth_date`     DATE NULL,
  `is_beneficiary` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dep_employee` (`employee_id`),
  CONSTRAINT `fk_dep_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;