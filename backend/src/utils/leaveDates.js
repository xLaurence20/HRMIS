/**
 * Parse 'YYYY-MM-DD' or Date into a local-time Date at midnight.
 * (Using the local-time constructor avoids timezone shifts.)
 */
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as 'YYYY-MM-DD'. */
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if a Date falls on Sat/Sun. */
function isWeekend(d) {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Load a Set of holiday date strings ('YYYY-MM-DD') between two dates.
 * Callers pass the pool/conn; we don't import db here to keep the util pure.
 */
export async function loadHolidaySet(conn, startDate, endDate) {
  const [rows] = await conn.query(
    `SELECT holiday_date FROM holidays
      WHERE holiday_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  return new Set(rows.map((r) => String(r.holiday_date).slice(0, 10)));
}

/**
 * Count working days (Mon-Fri, excluding holidays) between two dates, inclusive.
 */
export function countWorkingDays(startDate, endDate, holidaySet = new Set()) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = isoDate(cursor);
    if (!isWeekend(cursor) && !holidaySet.has(key)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Compute the total leave days for a range, factoring in half-days and
 * excluding weekends and holidays.
 *
 * Rules:
 *   - Single day, both halves set (AM start + PM end):   1.0
 *   - Single day, one half set:                          0.5
 *   - Single day, no halves:                             1.0
 *   - Multi-day, no halves:                              full working days
 *   - Multi-day, start_half = 'AM':                      subtract 0.5 from first day
 *   - Multi-day, end_half = 'PM':                        subtract 0.5 from last day
 */
export function computeLeaveDays({
  startDate, endDate, startHalf = null, endHalf = null, holidaySet = new Set(),
}) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end || start > end) return 0;

  const single = start.getTime() === end.getTime();

  // Single-day fast path
  if (single) {
    const key = isoDate(start);
    if (isWeekend(start) || holidaySet.has(key)) return 0;
    if (startHalf && endHalf) return 1.0;
    if (startHalf || endHalf) return 0.5;
    return 1.0;
  }

  // Multi-day: iterate and sum contributions
  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = isoDate(cursor);
    if (isWeekend(cursor) || holidaySet.has(key)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const isFirstDay = cursor.getTime() === start.getTime();
    const isLastDay = cursor.getTime() === end.getTime();

    let dayAmount = 1.0;
    if (isFirstDay && startHalf) dayAmount = 0.5;
    if (isLastDay && endHalf) dayAmount = 0.5;

    total += dayAmount;
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.round(total * 100) / 100;
}

/**
 * Return an array of { date, isWorking } for the range.
 * Used when the frontend wants to preview which days will be charged.
 */
export function enumerateDays(startDate, endDate, holidaySet = new Set()) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end || start > end) return [];

  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = isoDate(cursor);
    out.push({
      date: key,
      dayOfWeek: cursor.getDay(),
      isWeekend: isWeekend(cursor),
      isHoliday: holidaySet.has(key),
      isWorking: !isWeekend(cursor) && !holidaySet.has(key),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export const _internal = { toDate, isoDate, isWeekend };