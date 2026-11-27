import { format, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import {
  formatClearanceDate,
  type ClearanceRecord,
} from '@/lib/offboarding';

const PURPLE_RGB: [number, number, number] = [71, 33, 96];
const LOGO_URL = '/B1G_LOGO_COLORED.png';

function blank(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : '—';
}

function fileSlug(value: string): string {
  return value.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'employee';
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = value.length <= 10 ? parseISO(value) : new Date(value);
    return format(date, 'MMM d, yyyy');
  } catch {
    return value;
  }
}

/** The logo already reads B1G, so the word beside it is only the rest of the company name. */
function companySuffix(name: string): string {
  const rest = name.trim().replace(/^b1g\b\s*/i, '').trim();
  return (rest || name.trim() || 'Corporation').toUpperCase();
}

/** The logo file is purple on black. Clear the black so it sits on the white form. */
function clearBlackBackground(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 28 && pixels[i + 1] < 28 && pixels[i + 2] < 28) pixels[i + 3] = 0;
      }
      ctx.putImageData(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return dataUrl ? clearBlackBackground(dataUrl) : null;
  } catch {
    return null;
  }
}

async function loadCompanyName(fallback: string | null | undefined): Promise<string> {
  const { data } = await supabase.from('company_profile').select('name').limit(1).maybeSingle();
  const name = data && typeof data.name === 'string' ? data.name.trim() : '';
  return name || fallback?.trim() || 'B1G Corporation';
}

function clearanceLabel(status: ClearanceRecord['status']): string {
  if (status === 'cleared') return 'Cleared';
  if (status === 'cancelled') return 'Cancelled';
  return 'In progress';
}

export async function downloadClearancePdf(clearance: ClearanceRecord): Promise<void> {
  const [logo, companyName] = await Promise.all([
    loadLogo(),
    loadCompanyName(clearance.company_name),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const width = pageW - margin * 2;
  let y = 8;

  const ensure = (height: number) => {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
    doc.setFillColor(...PURPLE_RGB);
    doc.rect(margin, y, width, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`EXIT CLEARANCE  ·  ${clearance.employee_name}`, margin + 2, y + 4.1);
    doc.setTextColor(0, 0, 0);
    y += 8;
  };

  const logoW = 26;
  const logoH = 10;
  if (logo) doc.addImage(logo, 'PNG', margin, y, logoW, logoH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PURPLE_RGB);
  doc.text(companySuffix(companyName), margin + (logo ? logoW + 1.5 : 0), y + 7);
  y += 13;

  doc.setFillColor(...PURPLE_RGB);
  doc.rect(margin, y, width, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EMPLOYEE ACCOUNTABILITY AND EXIT CLEARANCE', pageW / 2, y + 5.3, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 8;

  const half = width / 2;
  const labelW = 34;
  const drawPair = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    doc.setFontSize(8);
    const valueW = half - labelW - 3;
    const leftLines = doc.splitTextToSize(leftValue || '—', valueW);
    const rightLines = doc.splitTextToSize(rightValue || '—', valueW);
    const rowH = Math.max(7, Math.max(leftLines.length, rightLines.length) * 3.5 + 2.6);
    ensure(rowH);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, half, rowH);
    doc.rect(margin + half, y, half, rowH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...PURPLE_RGB);
    doc.text(leftLabel, margin + 1.6, y + 4.3);
    doc.text(rightLabel, margin + half + 1.6, y + 4.3);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(leftLines, margin + labelW, y + 4.3);
    doc.text(rightLines, margin + half + labelW, y + 4.3);
    y += rowH;
  };

  drawPair('NAME', clearance.employee_name, 'EMPLOYEE NO.', blank(clearance.employee_code));
  drawPair('POSITION', blank(clearance.position_name), 'HIRING DATE', formatClearanceDate(clearance.hired_date));
  drawPair('DEPARTMENT', blank(clearance.department_name), 'IMMEDIATE HEAD', blank(clearance.immediate_head_name));
  drawPair('DAILY/MONTH RATE', blank(clearance.daily_monthly_rate), 'GROSS', blank(clearance.gross_pay));
  drawPair('RESIGNATION DATE', formatClearanceDate(clearance.resignation_submitted_on), 'ACCEPTANCE DATE', formatClearanceDate(clearance.acceptance_date));
  drawPair('LAST WORKING DAY', formatClearanceDate(clearance.last_working_day), 'STATUS', blank(clearance.employment_status));
  drawPair('COMPANY', companyName, 'CLEARANCE', clearanceLabel(clearance.status));

  doc.setFontSize(8);
  const reasonLines = doc.splitTextToSize(blank(clearance.reason), width - labelW - 3);
  const reasonH = Math.max(7, reasonLines.length * 3.5 + 2.6);
  ensure(reasonH);
  doc.setDrawColor(0);
  doc.rect(margin, y, width, reasonH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...PURPLE_RGB);
  doc.text('REASON', margin + 1.6, y + 4.3);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(reasonLines, margin + labelW, y + 4.3);
  y += reasonH + 4;

  const noticeLines = [
    'Notice to Employee:',
    '1. NO CLEARANCE - NO RELEASE OF FULL AND FINAL PAY',
    '2. Processing of clearance must be completed within 5 days from last day of work',
    '3. Accounting will only be the authorized department to release the final pay in form of cash/cheque together with the Quitclaim and Release Waiver to the resigned employee.',
  ];
  doc.setFontSize(8);
  const noticeWrapped = noticeLines.flatMap((line, index) => {
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    return doc.splitTextToSize(line, width - 6);
  });
  const noticeH = 6 + noticeWrapped.length * 3.6;
  ensure(noticeH + 14);
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, width, noticeH);
  let noticeY = y + 4.2;
  noticeLines.forEach((line, index) => {
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(line, width - 6);
    doc.text(lines, margin + 2, noticeY);
    noticeY += lines.length * 3.6;
  });
  y += noticeH + 4;

  const instruction = 'Instructions: Please check the box to indicate which items have been turned over. Do not sign until all accountabilities have been returned for your particular area of responsibility.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const instructionLines = doc.splitTextToSize(instruction, width - 16);
  instructionLines.forEach((line: string) => {
    doc.text(line, pageW / 2, y, { align: 'center' });
    y += 3.6;
  });
  y += 2;

  type Cell = string | { content: string; rowSpan: number; styles: { valign: 'middle'; fontStyle: 'bold' } };
  const body: Cell[][] = [];
  const signatures: Array<string | null> = [];
  clearance.sections.forEach((section, sectionIndex) => {
    const items = section.items.length > 0 ? section.items : [null];
    const department = `${sectionIndex + 1}. ${section.title}`;
    items.forEach((item, itemIndex) => {
      const row: Cell[] = [];
      if (itemIndex === 0) {
        row.push({
          content: department,
          rowSpan: items.length,
          styles: { valign: 'middle', fontStyle: 'bold' },
        });
      }
      row.push(
        item?.label ?? '',
        item?.remarks?.trim() || '',
        item?.signed_name?.trim() || '',
        item?.deduction?.trim() || '',
        item?.cleared_on ? shortDate(item.cleared_on) : '',
      );
      body.push(row);
      signatures.push(item?.signature_data ?? null);
    });
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['DEPARTMENT', 'ITEM/S', 'REMARKS', 'NAME/SIGNATURE', 'DEDUCTION', 'DATE\nCLEARED']],
    showHead: 'firstPage',
    body: body.length > 0 ? body : [['', 'No checklist items', '', '', '', '']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1.6,
      valign: 'middle',
      minCellHeight: 8,
      textColor: 0,
      lineColor: 0,
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: 0,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: 'bold', valign: 'middle' },
      1: { cellWidth: 46 },
      2: { cellWidth: 30 },
      3: { cellWidth: 36, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 24, halign: 'center' },
    },
    didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3 && signatures[data.row.index]) {
          data.cell.styles.minCellHeight = 18;
          data.cell.styles.valign = 'bottom';
        }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 3) return;
      const image = signatures[data.row.index];
      if (!image) return;
      const pad = 1;
      const imageW = Math.min(30, data.cell.width - pad * 2);
      const imageH = 8;
      try {
        doc.addImage(image, 'PNG', data.cell.x + (data.cell.width - imageW) / 2, data.cell.y + pad, imageW, imageH);
      } catch {
        // A damaged signature should not block the rest of the form.
      }
    },
  });

  const code = fileSlug(clearance.employee_code || clearance.employee_name);
  doc.save(`Exit-Clearance-${code}.pdf`);
}
