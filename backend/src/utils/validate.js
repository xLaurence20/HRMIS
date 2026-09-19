import { AppError } from './AppError.js';

/**
 * Field descriptor:
 *   {
 *     name: 'email',
 *     value: raw,
 *     required: true,
 *     type: 'string' | 'int' | 'date' | 'enum' | 'array',
 *     min, max,                    // for string length or int range
 *     enum: ['A','B'],             // for type: 'enum'
 *     pattern: /regex/,            // for type: 'string'
 *     transform: (v) => v,         // run after validation passes
 *     nullable: true,              // empty string -> null instead of error
 *   }
 */

const isEmpty = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function coerce(field, raw) {
  const { type = 'string', nullable = false } = field;

  if (isEmpty(raw)) {
    if (field.required) throw new FieldError(field.name, `${field.name} is required.`);
    return nullable ? null : undefined;
  }

  switch (type) {
    case 'int': {
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new FieldError(field.name, 'Must be a whole number.');
      if (field.min !== undefined && n < field.min)
        throw new FieldError(field.name, `Must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max)
        throw new FieldError(field.name, `Must be at most ${field.max}.`);
      return n;
    }
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new FieldError(field.name, 'Must be a number.');
      if (field.min !== undefined && n < field.min)
        throw new FieldError(field.name, `Must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max)
        throw new FieldError(field.name, `Must be at most ${field.max}.`);
      return n;
    }
    case 'date': {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime()))
        throw new FieldError(field.name, 'Must be a valid date (YYYY-MM-DD).');
      // Return the ISO date portion only.
      return d.toISOString().slice(0, 10);
    }
    case 'enum': {
      if (!field.enum.includes(raw))
        throw new FieldError(field.name, `Must be one of: ${field.enum.join(', ')}.`);
      return raw;
    }
    case 'array': {
      if (!Array.isArray(raw))
        throw new FieldError(field.name, 'Must be a list.');
      return raw;
    }
    case 'boolean': {
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
      throw new FieldError(field.name, 'Must be true or false.');
    }
    default: {
      const s = String(raw).trim();
      if (field.min && s.length < field.min)
        throw new FieldError(field.name, `Must be at least ${field.min} characters.`);
      if (field.max && s.length > field.max)
        throw new FieldError(field.name, `Must be at most ${field.max} characters.`);
      if (field.pattern && !field.pattern.test(s))
        throw new FieldError(field.name, field.message ?? 'Invalid format.');
      return s;
    }
  }
}

class FieldError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

/**
 * validate(body, fields) -> { value, errors }
 * Always returns both. Caller decides whether to throw.
 */
export function validate(body, fields) {
  const value = {};
  const errors = [];

  for (const field of fields) {
    try {
      const v = coerce(field, body?.[field.name]);
      if (v !== undefined) {
        value[field.name] = field.transform ? field.transform(v) : v;
      }
    } catch (err) {
      if (err instanceof FieldError) errors.push({ field: err.field, message: err.message });
      else throw err;
    }
  }

  return { value, errors };
}

/**
 * Convenience: throw a 400 with structured field errors if validation failed.
 */
export function assertValid(body, fields) {
  const { value, errors } = validate(body, fields);
  if (errors.length) {
    throw new AppError('Please correct the highlighted fields.', 400, 'VALIDATION_ERROR', {
      fields: errors,
    });
  }
  return value;
}

/* ------------------------------------------------------------------ *
 *  Query-string helpers (for list endpoints)
 * ------------------------------------------------------------------ */
export function parsePagination(query, { defaultLimit = 25, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function parseSort(query, allowedColumns, defaultSort) {
  const raw = String(query.sort ?? '').trim();
  if (!raw) return defaultSort;

  const [column, direction = 'asc'] = raw.split(':');
  if (!allowedColumns.includes(column)) return defaultSort;

  const dir = direction.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `${column} ${dir}`;
}