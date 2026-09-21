-- ============================================================================
--  HRMIS — FILE 9 of 12: HR Analytics, Reporting & Audit Trail
--  MariaDB 10.4+ / MySQL 8 | utf8mb4_unicode_ci
--  Run AFTER 07_phase4_schema.sql and 08_phase4_seed.sql.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ############################################################################
-- ## 5.1  audit_logs  (append-only — never UPDATE, never DELETE)            ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- When
  `event_time`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- Who
  `actor_user_id`   BIGINT UNSIGNED NULL
                    COMMENT 'NULL for system/unauthenticated events',
  `actor_username`  VARCHAR(60)   NULL
                    COMMENT 'Snapshot at time of event',
  `actor_role_code` VARCHAR(30)   NULL
                    COMMENT 'Snapshot at time of event',
  `ip_address`      VARCHAR(45)   NULL,
  `user_agent`      VARCHAR(255)  NULL,

  -- HTTP context (nullable for job/script events)
  `http_method`     VARCHAR(10)   NULL,
  `http_path`       VARCHAR(255)  NULL,
  `http_status`     SMALLINT UNSIGNED NULL,

  -- What happened
  `action`          VARCHAR(50)   NOT NULL
                    COMMENT 'create|update|delete|login|logout|approve|reject|export...',
  `entity_type`     VARCHAR(60)   NULL
                    COMMENT 'employees|users|leave_applications|...',
  `entity_id`       BIGINT UNSIGNED NULL,
  `entity_label`    VARCHAR(255)  NULL
                    COMMENT 'Human-readable snapshot e.g. "EMP-0001 — Dela Cruz, Juan"',

  -- Diff + extra context
  `changes`         JSON          NULL
                    COMMENT '{ field: { from, to } } for updates; { field: value } for creates',
  `metadata`        JSON          NULL
                    COMMENT 'Free-form context: filter params, reason, target user, etc.',

  -- Classification
  `severity`        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',

  -- Correlation (for grouping related events in one request/job)
  `request_id`      CHAR(36)      NULL,

  PRIMARY KEY (`id`),
  KEY `idx_audit_time`       (`event_time` DESC),
  KEY `idx_audit_actor`      (`actor_user_id`, `event_time` DESC),
  KEY `idx_audit_entity`     (`entity_type`, `entity_id`, `event_time` DESC),
  KEY `idx_audit_action`     (`action`, `event_time` DESC),
  KEY `idx_audit_severity`   (`severity`, `event_time` DESC),
  KEY `idx_audit_request`    (`request_id`),

  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit trail — never UPDATE, never DELETE';


-- ############################################################################
-- ## 5.2  report_definitions  (whitelist of available reports)              ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `report_definitions` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                  VARCHAR(50)  NOT NULL COMMENT 'EMP_DIRECTORY, COE, ...',
  `name`                  VARCHAR(150) NOT NULL,
  `description`           VARCHAR(500) NULL,

  `module`                ENUM('employees','attendance','leaves','credits',
                               'organization','audit','documents')
                          NOT NULL,
  `report_type`           ENUM('list','aggregate','document') NOT NULL DEFAULT 'list',

  `handler_key`           VARCHAR(80)  NOT NULL
                          COMMENT 'Backend function to invoke — never user-supplied',
  `default_filters`       JSON         NULL,
  `allowed_export_formats` JSON        NOT NULL
                          COMMENT 'Array e.g. ["csv","pdf"]',
  `required_permission`   VARCHAR(100) NOT NULL
                          COMMENT 'Permission needed to run this report',

  `is_system`             TINYINT(1)   NOT NULL DEFAULT 1
                          COMMENT '1 = seeded; cannot be deleted from UI',
  `is_active`             TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`            SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `icon`                  VARCHAR(50)  NULL COMMENT 'Lucide icon name',

  `created_by`            BIGINT UNSIGNED NULL,
  `updated_by`            BIGINT UNSIGNED NULL,
  `created_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_code` (`code`),
  KEY `idx_report_module`  (`module`, `sort_order`),
  KEY `idx_report_active`  (`is_active`),
  CONSTRAINT `fk_report_created_by` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_report_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catalogue of available reports — handler_key maps to backend function';


-- ############################################################################
-- ## 5.3  report_runs  (history of every report generation)                 ##
-- ############################################################################
CREATE TABLE IF NOT EXISTS `report_runs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id`     INT UNSIGNED    NULL COMMENT 'NULL for ad-hoc runs',

  `requested_by`  BIGINT UNSIGNED NOT NULL,
  `filters_used`  JSON            NULL,
  `export_format` ENUM('json','csv','pdf') NOT NULL DEFAULT 'json',

  `row_count`     INT UNSIGNED    NULL,
  `status`        ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  `error_message` VARCHAR(500)    NULL,

  `requested_at`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at`  DATETIME(3)     NULL,
  `duration_ms`   INT UNSIGNED    NULL,

  `ip_address`    VARCHAR(45)     NULL,

  PRIMARY KEY (`id`),
  KEY `idx_run_report`  (`report_id`, `requested_at` DESC),
  KEY `idx_run_user`    (`requested_by`, `requested_at` DESC),
  KEY `idx_run_status`  (`status`),
  CONSTRAINT `fk_run_report` FOREIGN KEY (`report_id`)
    REFERENCES `report_definitions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_run_user` FOREIGN KEY (`requested_by`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Execution history of every report generation';


SET FOREIGN_KEY_CHECKS = 1;


-- ############################################################################
-- ## 5.4  Convenience view for the audit trail UI                          ##
-- ############################################################################
CREATE OR REPLACE VIEW `v_audit_logs_full` AS
SELECT
  a.`id`,
  a.`event_time`,
  a.`actor_user_id`,
  a.`actor_username`,
  a.`actor_role_code`,
  u.`status`              AS `actor_user_status`,
  a.`ip_address`,
  a.`user_agent`,
  a.`http_method`,
  a.`http_path`,
  a.`http_status`,
  a.`action`,
  a.`entity_type`,
  a.`entity_id`,
  a.`entity_label`,
  a.`changes`,
  a.`metadata`,
  a.`severity`,
  a.`request_id`
FROM `audit_logs` a
LEFT JOIN `users` u ON u.`id` = a.`actor_user_id`;