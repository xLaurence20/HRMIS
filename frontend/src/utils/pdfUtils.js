import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Default agency header block for HR documents.
 * Overridable per-call by passing `agency` into the renderers.
 */
export const DEFAULT_AGENCY = {
  name: 'Republic of the Philippines',
  subheader: null,
  address: null,
  contact: null,
  logoDataUrl: null,
};

export const DEFAULT_SIGNATORIES = {
  // Two signature slots: HR Officer (prepared) and Executive (approved)
  preparedBy: {
    name: '__________________________',
    title: 'Human Resource Management Officer',
  },
  approvedBy: {
    name: '__________________________',
    title: 'Authorized Official',
  },
};

/**
 * Create a jsPDF document with sensible defaults for HR documents.
 * A4 portrait, mm units, tight margins suitable for tables.
 */
export function createDoc({ orientation = 'portrait', unit = 'mm', format = 'a4' } = {}) {
  return new jsPDF({ orientation, unit, format });
}

/**
 * Draw the agency letterhead at the top of the page.
 * Returns the Y position where content should begin.
 */
export function drawHeader(doc, agency, { compact = false } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  // Optional logo on the left
  if (agency.logoDataUrl) {
    try {
      doc.addImage(agency.logoDataUrl, 'PNG', margin, y, 18, 18);
    } catch { /* ignore bad image */ }
  }

  // Centered header text — shift right if logo present
  const centerX = pageWidth / 2 + (agency.logoDataUrl ? 10 : 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(compact ? 9 : 10);
  doc.text(agency.name ?? DEFAULT_AGENCY.name, centerX, y + 4, { align: 'center' });

  if (agency.subheader) {
    doc.setFontSize(compact ? 8 : 9);
    doc.text(agency.subheader, centerX, y + 8, { align: 'center' });
  }
  if (agency.address) {
    doc.setFontSize(compact ? 7 : 8);
    doc.text(agency.address, centerX, y + 12, { align: 'center' });
  }
  if (agency.contact) {
    doc.setFontSize(compact ? 7 : 8);
    doc.text(agency.contact, centerX, y + 16, { align: 'center' });
  }

  y = compact ? 25 : 30;

  // Horizontal rule
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);

  return y + 4;
}

/**
 * Draw "Page X of Y" at the bottom of every page.
 * Call after all content is added.
 */
export function drawFooter(doc, { note = null } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);

    if (note) {
      doc.text(note, 15, pageHeight - 8);
    }

    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - 15,
      pageHeight - 8,
      { align: 'right' }
    );

    doc.setTextColor(0);
  }
}

/**
 * Draw centered document title + subtitle.
 * Returns the Y position after the title block.
 */
export function drawTitle(doc, title, { subtitle = null, y = 40 } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title.toUpperCase(), centerX, y, { align: 'center' });

  let newY = y + 7;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(subtitle, centerX, newY, { align: 'center' });
    newY += 5;
  }

  return newY + 3;
}

/**
 * Add a table using jspdf-autotable with a house style.
 */
export function addTable(doc, { columns, rows, startY, options = {} }) {
  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        if (c.format) return c.format(v, row);
        return v === null || v === undefined ? '' : String(v);
      })
    ),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align ?? 'left' }])
    ),
    margin: { left: 15, right: 15 },
    ...options,
  });

  return doc.lastAutoTable.finalY;
}

/**
 * Draw a signature block. Two columns by default.
 */
export function drawSignatureBlock(doc, signatories, {
  startY,
  leftLabel = 'Prepared by:',
  rightLabel = 'Approved by:',
  note = null,
} = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const halfWidth = (pageWidth - margin * 2) / 2;
  const y = startY + 15;

  // If we're near the bottom, start a fresh page
  const pageHeight = doc.internal.pageSize.getHeight();
  const blockHeight = 40;
  if (y + blockHeight > pageHeight - 20) {
    doc.addPage();
  }

  const actualY = doc.lastAutoTable?.finalY ?? startY;
  const signatureY = Math.max(y, actualY + 20);

  const left = signatories.preparedBy ?? DEFAULT_SIGNATORIES.preparedBy;
  const right = signatories.approvedBy ?? DEFAULT_SIGNATORIES.approvedBy;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Left column
  doc.text(leftLabel, margin, signatureY);
  doc.setFont('helvetica', 'bold');
  doc.text(left.name, margin, signatureY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(left.title, margin, signatureY + 18);

  // Right column
  doc.setFontSize(9);
  doc.text(rightLabel, margin + halfWidth + 10, signatureY);
  doc.setFont('helvetica', 'bold');
  doc.text(right.name, margin + halfWidth + 10, signatureY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(right.title, margin + halfWidth + 10, signatureY + 18);

  // Optional note under the block
  if (note) {
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(note, margin, signatureY + 25);
    doc.setTextColor(0);
  }
}

/**
 * Trigger a download of the given jsPDF document.
 */
export function savePdf(doc, filename) {
  const safe = String(filename).replace(/[^\w.\-]+/g, '_');
  doc.save(safe);
}

/** Small helper: format ISO date strings for display. */
export function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

export function fmtLongDate(d = new Date()) {
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}