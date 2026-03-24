/**
 * Acknowledgement Export — PDF, CSV, XLSX
 * Exports who acknowledged (announcements/policies) and when.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AcknowledgementItem {
  employee_name: string;
  acknowledged_at: string;
}

export interface ExportAcknowledgementsOptions {
  items: AcknowledgementItem[];
  title: string;
  format: 'pdf' | 'csv' | 'xlsx';
}

function escapeCsvField(val: string): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatAcknowledgedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function exportAcknowledgements(options: ExportAcknowledgementsOptions): void {
  const { items, title, format } = options;
  const rows = items.map((item) => ({
    employeeName: item.employee_name,
    acknowledgedAt: formatAcknowledgedAt(item.acknowledged_at),
  }));
  const filename = `acknowledgements-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)}`;

  if (format === 'csv') {
    const headers = ['Employee Name', 'Acknowledged At'];
    const lines = [
      headers.join(','),
      ...rows.map((r) => [r.employeeName, r.acknowledgedAt].map(escapeCsvField).join(',')),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'xlsx') {
    const wsData = [
      ['Employee Name', 'Acknowledged At'],
      ...rows.map((r) => [r.employeeName, r.acknowledgedAt]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Acknowledgements');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(title.slice(0, 80), 14, 20);
    doc.setFontSize(10);
    doc.text(`${rows.length} acknowledgement${rows.length !== 1 ? 's' : ''}`, 14, 28);

    const tableData = rows.map((r) => [r.employeeName.slice(0, 50), r.acknowledgedAt]);
    autoTable(doc, {
      startY: 36,
      head: [['Employee Name', 'Acknowledged At']],
      body: tableData,
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 80 } },
    });

    doc.save(`${filename}.pdf`);
  }
}
