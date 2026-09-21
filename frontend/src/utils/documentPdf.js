import {
  createDoc, drawHeader, drawFooter, drawTitle,
  addTable, drawSignatureBlock, savePdf,
  DEFAULT_AGENCY, DEFAULT_SIGNATORIES,
  fmtLongDate, fmtMoney, fmtDate,
} from './pdfUtils.js';

/* ================================================================== *
 *  Certificate of Employment
 * ================================================================== */
export function buildCOEPdf({
  agency = DEFAULT_AGENCY,
  employee,
  purpose = null,
  signatories = DEFAULT_SIGNATORIES,
  preparedOn = new Date(),
} = {}) {
  const doc = createDoc({ orientation: 'portrait' });

  let y = drawHeader(doc, agency);
  y = drawTitle(doc, 'Certificate of Employment', { y });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // Body text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lineHeight = 6.5;

  doc.text('TO WHOM IT MAY CONCISE:', margin, y);
  y += lineHeight * 2;

  const salutation = 'This is to certify that ';

  const fullName = employee.fullName ?? '____________';
  const position = employee.positionTitle ?? '____________';
  const department = employee.departmentName ?? '____________';
  const status = employee.employmentStatus ?? '____________';
  const dateHired = fmtDate(employee.dateHired);

  // We'll manually wrap since jsPDF doesn't auto-wrap on mixed styles nicely.
  const body =
    `Mr./Ms. ${fullName}, holding the position of ${position} ` +
    `at the ${department}, and is currently employed in a ${status} ` +
    `capacity effective ${dateHired}.`;

  const wrapped = doc.splitTextToSize(body, pageWidth - margin * 2);
  doc.text(wrapped, margin, y);
  y += wrapped.length * lineHeight + lineHeight;

  // Salary line if disclosed
  if (employee.monthlySalary != null) {
    const salaryLine =
      `His/Her current monthly compensation is PHP ${fmtMoney(employee.monthlySalary)} ` +
      `(Salary Grade ${employee.salaryGrade ?? '—'}, Step ${employee.stepIncrement ?? '—'}).`;
    const wrappedSalary = doc.splitTextToSize(salaryLine, pageWidth - margin * 2);
    doc.text(wrappedSalary, margin, y);
    y += wrappedSalary.length * lineHeight + lineHeight;
  }

  // Purpose
  if (purpose) {
    const purposeLine =
      `This certification is issued upon the request of the above-named employee ` +
      `for ${purpose}.`;
    const wrappedPurpose = doc.splitTextToSize(purposeLine, pageWidth - margin * 2);
    doc.text(wrappedPurpose, margin, y);
    y += wrappedPurpose.length * lineHeight + lineHeight;
  } else {
    const purposeLine =
      'This certification is issued upon the request of the above-named employee ' +
      'for whatever legal purpose it may serve.';
    const wrappedPurpose = doc.splitTextToSize(purposeLine, pageWidth - margin * 2);
    doc.text(wrappedPurpose, margin, y);
    y += wrappedPurpose.length * lineHeight + lineHeight;
  }

  // Issued date + place
  const issuedLine = `Issued this ${fmtLongDate(preparedOn)} at ____________.`;
  const wrappedIssued = doc.splitTextToSize(issuedLine, pageWidth - margin * 2);
  doc.text(wrappedIssued, margin, y);
  y += wrappedIssued.length * lineHeight * 2;

  drawSignatureBlock(doc, signatories, {
    startY: y,
    leftLabel: '',
    rightLabel: '',
    note: 'This certificate is valid only for the purpose stated above.',
  });

  drawFooter(doc, { note: `COE — ${employee.employeeNumber ?? ''}` });

  return doc;
}

export function downloadCOEPdf(args) {
  const doc = buildCOEPdf(args);
  const name = args?.employee?.employeeNumber
    ? `COE_${args.employee.employeeNumber}.pdf`
    : 'COE.pdf';
  savePdf(doc, name);
}

/* ================================================================== *
 *  Service Record (CSC-formatted)
 * ================================================================== */
export function buildServiceRecordPdf({
  agency = DEFAULT_AGENCY,
  employee,
  records = [],
  signatories = DEFAULT_SIGNATORIES,
  preparedOn = new Date(),
} = {}) {
  const doc = createDoc({ orientation: 'landscape' });

  let y = drawHeader(doc, agency, { compact: true });
  y = drawTitle(doc, 'Service Record', {
    subtitle: '(Civil Service Commission Form No. 2)',
    y: y + 3,
  });

  // Employee header block — two columns of key/value pairs
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const leftCol = [
    ['Name:', employee.fullName ?? '—'],
    ['Employee No.:', employee.employeeNumber ?? '—'],
    ['Date of Birth:', fmtDate(employee.birthDate)],
    ['Civil Status:', employee.civilStatus ?? '—'],
  ];
  const rightCol = [
    ['Department:', employee.departmentName ?? '—'],
    ['Current Position:', employee.currentPosition ?? '—'],
    ['Employment Status:', employee.employmentStatus ?? '—'],
    ['Date Hired:', fmtDate(employee.dateHired)],
  ];

  const colX = [margin, pageWidth / 2 + 5];
  let yLeft = y;
  let yRight = y;
  const rowH = 5;

  leftCol.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(k, colX[0], yLeft);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), colX[0] + 28, yLeft);
    yLeft += rowH;
  });
  rightCol.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(k, colX[1], yRight);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), colX[1] + 32, yRight);
    yRight += rowH;
  });

  y = Math.max(yLeft, yRight) + 4;

  // Records table — CSC-style columns
  const columns = [
    { key: 'sequence', header: '#' },
    { key: 'recordType', header: 'Nature of Appointment / Status' },
    { key: 'fromDate', header: 'From', format: (v) => fmtDate(v) },
    {
      key: '_toDate',
      header: 'To',
      format: (_v, row) => (row.isPresent ? 'Present' : fmtDate(row.toDate)),
    },
    { key: 'positionTitle', header: 'Position Title' },
    { key: 'departmentName', header: 'Office / Department' },
    { key: 'agency', header: 'Agency' },
    { key: 'salaryGrade', header: 'SG', align: 'right' },
    { key: 'stepIncrement', header: 'Step', align: 'right' },
    {
      key: 'monthlySalary',
      header: 'Salary',
      align: 'right',
      format: (v) => (v != null ? fmtMoney(v) : '—'),
    },
    { key: 'appointmentType', header: 'Appt. Type' },
    {
      key: 'legalBasis',
      header: 'Legal Basis',
      format: (v) => v ?? '—',
    },
  ];

  addTable(doc, { columns, rows: records, startY: y });

  // Signature
  const finalY = doc.lastAutoTable?.finalY ?? y;
  drawSignatureBlock(doc, signatories, {
    startY: finalY,
    leftLabel: 'Prepared by:',
    rightLabel: 'Certified correct:',
    note: `Generated on ${fmtLongDate(preparedOn)} from the HRMIS personnel database.`,
  });

  drawFooter(doc, { note: `Service Record — ${employee.employeeNumber ?? ''}` });

  return doc;
}

export function downloadServiceRecordPdf(args) {
  const doc = buildServiceRecordPdf(args);
  const name = args?.employee?.employeeNumber
    ? `ServiceRecord_${args.employee.employeeNumber}.pdf`
    : 'ServiceRecord.pdf';
  savePdf(doc, name);
}