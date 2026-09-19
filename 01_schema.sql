-- ============================================================================
--  HRMIS — FILE 1 of 6: Core Authentication & RBAC
--  Target: Aiven MySQL 8 (defaultdb) / Local MariaDB
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id`           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`         VARCHAR(50)  NOT NULL,
  `role_name`    VARCHAR(100) NOT NULL,
  `description`  VARCHAR(255) NULL,
  `authority_level` TINYINT UNSIGNED NOT NULL DEFAULT 10,
  `is_system`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`),
  UNIQUE KEY `uq_roles_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permission_name` VARCHAR(100) NOT NULL,
  `module`          VARCHAR(50)  NOT NULL,
  `description`     VARCHAR(255) NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_name` (`permission_name`),
  KEY `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       SMALLINT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED      NOT NULL,
  `created_at`    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`)
    REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- departments (stub — extended in File 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30)  NOT NULL,
  `name`       VARCHAR(150) NOT NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dept_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`              VARCHAR(60)  NOT NULL,
  `email`                 VARCHAR(150) NOT NULL,
  `password_hash`         VARCHAR(255) NOT NULL,
  `role_id`               SMALLINT UNSIGNED NOT NULL,
  `status`                ENUM('pending','active','suspended','disabled')
                          NOT NULL DEFAULT 'pending',
  `profile_completed`     TINYINT(1)   NOT NULL DEFAULT 0,
  `must_change_password`  TINYINT(1)   NOT NULL DEFAULT 1,
  `password_changed_at`   DATETIME     NULL,
  `failed_login_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until`          DATETIME     NULL,
  `last_login_at`         DATETIME     NULL,
  `last_login_ip`         VARCHAR(45)  NULL,
  `created_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`            DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email`    (`email`),
  KEY `idx_users_role`           (`role_id`),
  KEY `idx_users_status`         (`status`, `deleted_at`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `first_name`     VARCHAR(80)  NOT NULL,
  `middle_name`    VARCHAR(80)  NULL,
  `last_name`      VARCHAR(80)  NOT NULL,
  `extension_name` VARCHAR(20)  NULL,
  `phone`          VARCHAR(20)  NULL,
  `department_id`  INT UNSIGNED NULL,
  `position`       VARCHAR(150) NULL,
  `avatar_url`     VARCHAR(255) NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_profile_user` (`user_id`),
  KEY `idx_profile_dept`       (`department_id`),
  KEY `idx_profile_name`       (`last_name`, `first_name`),
  CONSTRAINT `fk_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_profile_dept` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `jti`            CHAR(36)        NOT NULL,
  `token_hash`     CHAR(64)        NOT NULL,
  `family_id`      CHAR(36)        NOT NULL,
  `replaced_by_id` BIGINT UNSIGNED NULL,
  `user_agent`     VARCHAR(255)    NULL,
  `ip_address`     VARCHAR(45)     NULL,
  `issued_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`     DATETIME        NOT NULL,
  `revoked_at`     DATETIME        NULL,
  `revoked_reason` VARCHAR(50)     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rt_jti`  (`jti`),
  UNIQUE KEY `uq_rt_hash` (`token_hash`),
  KEY `idx_rt_user`       (`user_id`, `revoked_at`, `expires_at`),
  KEY `idx_rt_family`     (`family_id`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rt_replaced_by` FOREIGN KEY (`replaced_by_id`)
    REFERENCES `refresh_tokens` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- login_attempts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT UNSIGNED NULL,
  `username_try` VARCHAR(60)  NOT NULL,
  `ip_address`   VARCHAR(45)  NOT NULL,
  `user_agent`   VARCHAR(255) NULL,
  `success`      TINYINT(1)   NOT NULL,
  `fail_reason`  VARCHAR(60)  NULL,
  `attempted_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_la_user_time` (`user_id`, `attempted_at`),
  KEY `idx_la_ip_time`   (`ip_address`, `attempted_at`),
  CONSTRAINT `fk_la_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;