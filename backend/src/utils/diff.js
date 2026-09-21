/**
 * Compute the difference between two objects.
 * Returns { field: { from, to } } for changed fields only.
 *
 * Deep-equal on scalars and small objects. Ignores fields in `ignore`.
 * Treats `undefined` and `null` as equal (both mean "absent").
 */
export function diffObjects(before, after, ignore = []) {
  if (!before || !after) return {};
  const skip = new Set(ignore);
  const changes = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (skip.has(key)) continue;

    const from = before[key];
    const to = after[key];

    // Normalize undefined <-> null
    const normFrom = from === undefined ? null : from;
    const normTo = to === undefined ? null : to;

    if (!valuesEqual(normFrom, normTo)) {
      changes[key] = { from: normFrom, to: normTo };
    }
  }

  return changes;
}

/**
 * Build a "create" snapshot from an object.
 * Nulls are dropped to keep audit rows compact.
 */
export function snapshotForCreate(row, ignore = []) {
  if (!row) return {};
  const skip = new Set(ignore);
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key)) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Build a "delete" snapshot from an object.
 * Same as create — we keep a full copy of the pre-delete state.
 */
export function snapshotForDelete(row, ignore = []) {
  return snapshotForCreate(row, ignore);
}

/* ------------------------------------------------------------------ *
 *  Internal
 * ------------------------------------------------------------------ */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Dates compared by time
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }

  // Decimal strings — coerce numerically when both look numeric
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }

  // Nested objects — shallow stringify (good enough for our entity rows)
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return String(a) === String(b);
}

/** Fields commonly present on every row that we never want in the diff. */
export const AUDIT_IGNORE_FIELDS = [
  'updated_at',
  'updated_by',
  'created_at',
  'created_by',
  'password_hash',
  'two_factor_secret',
  'jti',
  'token_hash',
];