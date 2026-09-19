-- ============================================================================
--  HRMIS — FILE 6 of 6: Holidays, Thresholds, Sample DTR
-- ============================================================================

INSERT IGNORE INTO `holidays`
  (`holiday_date`, `name`, `holiday_type`, `is_recurring`, `legal_basis`)
VALUES
  ('2025-01-01', 'New Year''s Day',                  'regular', 1, 'EO 292'),
  ('2025-04-09', 'Araw ng Kagitingan',               'regular', 1, 'EO 292'),
  ('2025-05-01', 'Labor Day',                        'regular', 1, 'EO 292'),
  ('2025-06-12', 'Independence Day',                 'regular', 1, 'EO 292'),
  ('2025-11-30', 'Bonifacio Day',                    'regular', 1, 'EO 292'),
  ('2025-12-25', 'Christmas Day',                    'regular', 1, 'EO 292'),
  ('2025-12-30', 'Rizal Day',                        'regular', 1, 'EO 292'),
  ('2025-04-17', 'Maundy Thursday',                  'regular', 0, 'Proclamation'),
  ('2025-04-18', 'Good Friday',                      'regular', 0, 'Proclamation'),
  ('2025-08-25', 'National Heroes Day',              'regular', 0, 'EO 292'),
  ('2025-01-29', 'Chinese New Year',                 'special_non_working', 0, 'Proclamation'),
  ('2025-02-25', 'EDSA People Power Anniversary',    'special_non_working', 1, 'Proclamation'),
  ('2025-08-21', 'Ninoy Aquino Day',                 'special_non_working', 1, 'RA 9256'),
  ('2025-11-01', 'All Saints'' Day',                 'special_non_working', 1, 'EO 292'),
  ('2025-12-08', 'Immaculate Conception',            'special_non_working', 1, 'RA 10966'),
  ('2025-12-31', 'Last Day of the Year',             'special_non_working', 1, 'EO 292'),
  ('2026-01-01', 'New Year''s Day',                  'regular', 1, 'EO 292'),
  ('2026-04-09', 'Araw ng Kagitingan',               'regular', 1, 'EO 292'),
  ('2026-05-01', 'Labor Day',                        'regular', 1, 'EO 292'),
  ('2026-06-12', 'Independence Day',                 'regular', 1, 'EO 292'),
  ('2026-11-30', 'Bonifacio Day',                    'regular', 1, 'EO 292'),
  ('2026-12-25', 'Christmas Day',                    'regular', 1, 'EO 292'),
  ('2026-12-30', 'Rizal Day',                        'regular', 1, 'EO 292');

INSERT INTO `attendance_thresholds`
  (`department_id`, `tardy_minutes_monthly`, `undertime_minutes_monthly`,
   `absences_monthly`, `is_active`)
VALUES
  (NULL, 60, 60, 2.0, 1)
ON DUPLICATE KEY UPDATE
  `tardy_minutes_monthly`     = VALUES(`tardy_minutes_monthly`),
  `undertime_minutes_monthly` = VALUES(`undertime_minutes_monthly`),
  `absences_monthly`          = VALUES(`absences_monthly`);