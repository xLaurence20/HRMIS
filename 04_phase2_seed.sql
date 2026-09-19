-- ============================================================================
--  HRMIS — FILE 4 of 6: Departments, Positions, Demo Employees
-- ============================================================================

INSERT INTO `departments` (`code`,`name`,`short_name`,`office_type`,`is_active`,`sort_order`)
VALUES
  ('OCEO','Office of the City Executive','OCEO','department',1,10),
  ('HRMO','Human Resource Management Office','HRMO','department',1,20),
  ('FIN','City Finance Department','FIN','department',1,30),
  ('BUDGET','City Budget Office','BUDGET','department',1,40),
  ('ACCT','City Accounting Office','ACCT','department',1,50),
  ('IT','Information Technology Division','IT','division',1,60),
  ('LEGAL','City Legal Office','LEGAL','department',1,70),
  ('ASSESS','City Assessor''s Office','ASSESS','department',1,80)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `short_name` = VALUES(`short_name`);

INSERT INTO `positions`
  (`code`,`title`,`department_id`,`salary_grade`,`step`,`position_class`,`level`,
   `is_plantilla`,`is_supervisory`,`monthly_rate`,`is_active`)
SELECT 'PL-0001','City Government Department Head II',
       d.id, 26, 1, 'Executive/Managerial','3rd Level', 1, 1, 95000.00, 1
FROM `departments` d WHERE d.code = 'OCEO'
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `positions`
  (`code`,`title`,`department_id`,`salary_grade`,`step`,`position_class`,`level`,
   `is_plantilla`,`is_supervisory`,`monthly_rate`,`is_active`)
SELECT 'PL-0002','Human Resource Management Officer III',
       d.id, 18, 1, 'Professional','2nd Level', 1, 1, 48000.00, 1
FROM `departments` d WHERE d.code = 'HRMO'
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `positions`
  (`code`,`title`,`department_id`,`salary_grade`,`step`,`position_class`,`level`,
   `is_plantilla`,`is_supervisory`,`monthly_rate`,`is_active`)
SELECT 'PL-0003','Administrative Officer II',
       d.id, 11, 1, 'Sub-professional','1st Level', 1, 0, 27000.00, 1
FROM `departments` d WHERE d.code = 'HRMO'
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `positions`
  (`code`,`title`,`department_id`,`salary_grade`,`step`,`position_class`,`level`,
   `is_plantilla`,`is_supervisory`,`monthly_rate`,`is_active`)
SELECT 'PL-0004','Information Technology Officer I',
       d.id, 15, 1, 'Professional','2nd Level', 1, 0, 38000.00, 1
FROM `departments` d WHERE d.code = 'IT'
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `positions`
  (`code`,`title`,`department_id`,`salary_grade`,`step`,`position_class`,`level`,
   `is_plantilla`,`is_supervisory`,`monthly_rate`,`is_active`)
SELECT 'PL-0005','City Accountant',
       d.id, 25, 1, 'Professional','3rd Level', 1, 1, 88000.00, 1
FROM `departments` d WHERE d.code = 'ACCT'
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `employees`
  (`employee_number`,`last_name`,`first_name`,`middle_name`,`gender`,`birth_date`,
   `civil_status`,`citizenship`,`mobile_no`,`personal_email`,
   `department_id`,`position_id`,`employment_status`,`date_hired`,
   `salary_grade`,`step_increment`,`monthly_salary`)
SELECT 'EMP-0001','Dela Cruz','Juan','Santos','Male','1985-04-12',
       'Married','Filipino','+639171234567','juan.delacruz@agency.gov.ph',
       d.id, p.id, 'Permanent','2012-06-01', 18, 3, 48000.00
FROM `departments` d, `positions` p
WHERE d.code = 'HRMO' AND p.code = 'PL-0002'
ON DUPLICATE KEY UPDATE `last_name` = VALUES(`last_name`);

INSERT INTO `employees`
  (`employee_number`,`last_name`,`first_name`,`middle_name`,`gender`,`birth_date`,
   `civil_status`,`citizenship`,`mobile_no`,`personal_email`,
   `department_id`,`position_id`,`employment_status`,`date_hired`,
   `salary_grade`,`step_increment`,`monthly_salary`)
SELECT 'EMP-0002','Reyes','Maria Clara','Bautista','Female','1992-09-23',
       'Single','Filipino','+639181234567','maria.reyes@agency.gov.ph',
       d.id, p.id, 'Permanent','2018-02-15', 11, 2, 27000.00
FROM `departments` d, `positions` p
WHERE d.code = 'HRMO' AND p.code = 'PL-0003'
ON DUPLICATE KEY UPDATE `last_name` = VALUES(`last_name`);

INSERT INTO `employees`
  (`employee_number`,`last_name`,`first_name`,`middle_name`,`gender`,`birth_date`,
   `civil_status`,`citizenship`,`mobile_no`,`personal_email`,
   `department_id`,`position_id`,`employment_status`,`date_hired`,
   `salary_grade`,`step_increment`,`monthly_salary`)
SELECT 'EMP-0003','Santos','Pedro','Garcia','Male','1990-01-05',
       'Married','Filipino','+639191234567','pedro.santos@agency.gov.ph',
       d.id, p.id, 'Permanent','2016-08-20', 15, 2, 38000.00
FROM `departments` d, `positions` p
WHERE d.code = 'IT' AND p.code = 'PL-0004'
ON DUPLICATE KEY UPDATE `last_name` = VALUES(`last_name`);

UPDATE `departments` d
JOIN `employees` e ON e.employee_number = 'EMP-0001'
SET d.head_employee_id = e.id
WHERE d.code = 'HRMO';

INSERT INTO `service_records`
  (`employee_id`,`sequence_no`,`record_type`,`from_date`,`is_present`,
   `position_title`,`position_id`,`department_id`,`department_name`,
   `salary_grade`,`step_increment`,`monthly_salary`,
   `appointment_type`,`appointment_status`,`legal_basis`)
SELECT e.id, 1, 'Original Appointment', e.date_hired, 1,
       p.title, p.id, d.id, d.name,
       e.salary_grade, e.step_increment, e.monthly_salary,
       'Permanent','Active','Original appointment paper'
FROM `employees` e
JOIN `positions` p    ON p.id = e.position_id
JOIN `departments` d  ON d.id = e.department_id
WHERE e.employee_number = 'EMP-0001'
  AND NOT EXISTS (
    SELECT 1 FROM `service_records` sr
     WHERE sr.employee_id = e.id AND sr.record_type = 'Original Appointment'
  );