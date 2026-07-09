/**
 * Shared PDF report layout — company header block (matches Leave Report template).
 */

import type { jsPDF } from 'jspdf';
import type { CompanyProfileForExport } from '@/lib/exportXlsxReportLayout';

function companyPhone(profile: CompanyProfileForExport): string {
  return profile.mobile_number || profile.phone || '';
}

/** Draw B1G company header; returns Y position where the data table should start. */
export function drawCompanyPdfHeader(
  doc: jsPDF,
  profile: CompanyProfileForExport,
  reportTitle: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftX = 14;
  const rightX = pageWidth - 14;
  const addressMaxWidth = pageWidth / 2 - leftX - 8;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('B1G', leftX, 16);

  doc.setFontSize(11);
  doc.text(profile.name || 'B1G Corporation', leftX, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  let nextY = 30;
  if (profile.address?.trim()) {
    const addressLines = doc.splitTextToSize(profile.address.trim(), addressMaxWidth);
    doc.text(addressLines, leftX, nextY);
    nextY += addressLines.length * 5;
  }

  const phone = companyPhone(profile);
  if (phone) {
    doc.text(phone, leftX, nextY);
    nextY += 6;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, rightX, 16, { align: 'right' });

  return Math.max(44, nextY + 8);
}

export const PDF_YELLOW_TABLE_HEAD_STYLES = {
  fillColor: [255, 255, 0] as [number, number, number],
  textColor: [0, 0, 0] as [number, number, number],
  fontStyle: 'bold' as const,
  halign: 'center' as const,
};
