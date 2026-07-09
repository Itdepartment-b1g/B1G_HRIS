import * as XLSX from 'xlsx';

export interface AttendanceBreakdownExportRow {
  date: string;
  employee_code: string;
  employee_name: string;
  assigned_shift_formatted: string;
  time_in: string | null;
  time_out: string | null;
  minutes_late: number | null;
  status: string;
  remarks: string | null;
}

export interface ExportAttendanceBreakdownOptions {
  rows: AttendanceBreakdownExportRow[];
  dateFrom: string;
  dateTo: string;
  format: 'csv' | 'xlsx';
}

const REPORT_HEADERS = [
  'Date',
  'Emp. Code',
  'Employee',
  'Assigned Shift',
  'Actual Time In',
  'Actual Time Out',
  'Mins Late',
  'Status',
  'Remarks',
];

function formatDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';

  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatMinutesLate(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—';
  return String(minutes);
}

function formatStatus(status: string): string {
  if (!status) return '—';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function rowToArray(row: AttendanceBreakdownExportRow): string[] {
  return [
    formatDate(row.date),
    row.employee_code || '—',
    row.employee_name || '—',
    row.assigned_shift_formatted || '—',
    formatDateTime(row.time_in),
    formatDateTime(row.time_out),
    formatMinutesLate(row.minutes_late),
    formatStatus(row.status),
    row.remarks || '',
  ];
}

function escapeCsvField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCsv(rows: AttendanceBreakdownExportRow[], filename: string): void {
  const lines = [
    REPORT_HEADERS.join(','),
    ...rows.map((row) => rowToArray(row).map(escapeCsvField).join(',')),
  ];
  const blob = new Blob(['\uFEFF', lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXlsx(rows: AttendanceBreakdownExportRow[], filename: string): void {
  const wsData = [REPORT_HEADERS, ...rows.map((row) => rowToArray(row))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 },
    { wch: 14 },
    { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Breakdown');
  XLSX.writeFile(wb, filename);
}

export async function exportAttendanceBreakdown(
  options: ExportAttendanceBreakdownOptions
): Promise<void> {
  const { rows, dateFrom, dateTo, format } = options;
  const filename = `attendance-breakdown-${dateFrom}-to-${dateTo}`;

  if (format === 'csv') {
    downloadCsv(rows, `${filename}.csv`);
  } else {
    downloadXlsx(rows, `${filename}.xlsx`);
  }
}
