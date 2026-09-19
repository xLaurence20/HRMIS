/**
 * Parse a CSV string into { headers, rows }.
 * - Strips a leading UTF-8 BOM (common in Excel exports).
 * - Handles quoted fields containing commas, newlines, and "" escapes.
 * - Normalizes header names: lowercased, spaces -> underscores.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') return { headers: [], rows: [] };

  // Strip UTF-8 BOM
  const clean = text.replace(/^\uFEFF/, '');

  const lines = splitCsv(clean);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = lines[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    // Skip entirely-blank rows
    if (cells.every((c) => c === '')) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Split CSV text into an array of rows, where each row is an array of cells.
 * Correctly handles newlines inside quoted fields.
 */
function splitCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;                       // ignore CR
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }

    cell += ch;
  }

  // Flush last cell/row
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Normalize a time string to HH:MM:SS or return null.
 * Accepts: "8:00", "08:00", "8:00:00", "08:00 AM", "0800", "8am"
 */
export function parseTimeFlexible(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;

  // Match HH:MM(:SS)? with optional AM/PM
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) {
    // Match "0800" or "8"
    m = s.match(/^(\d{1,2})(\d{2})?\s*(AM|PM)?$/);
    if (!m) return null;
    m = [null, m[1], m[2] ?? '00', '00', m[3]];
  }

  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3] ?? '00', 10);
  const ampm = m[4];

  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Normalize a date string to YYYY-MM-DD or return null.
 * Accepts: "2026-09-19", "9/19/2026", "09/19/2026", "2026/09/19"
 */
export function parseDateFlexible(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // US: M/D/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}