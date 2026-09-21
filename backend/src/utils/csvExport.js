/**
 * Convert an array of row objects into a CSV string.
 * `columns` = [{ key, header, format? }]
 *   - key:     property on the row object
 *   - header:  column header text
 *   - format:  optional fn(value, row) => cell text
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsv(c.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.format ? c.format(row[c.key], row) : row[c.key];
        return escapeCsv(formatValue(raw));
      })
      .join(',')
  );
  return '\uFEFF' + [header, ...body].join('\r\n');   // BOM for Excel
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Send a CSV response with a download-friendly filename.
 * Sets Content-Type, Content-Disposition, and streams the string.
 */
export function sendCsvDownload(res, filename, csvContent) {
  const safeName = String(filename).replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
  return res.send(csvContent);
}

/**
 * Build a filename with a timestamp suffix.
 * e.g. "audit-logs_20260921_1430.csv"
 */
export function timestampedFilename(base, extension) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}_${stamp}.${extension}`;
}