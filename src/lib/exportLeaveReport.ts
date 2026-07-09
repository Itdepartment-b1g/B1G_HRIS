/**
 * Leave Report Export — PDF, CSV, XLSX
 * Per-request leave breakdown grouped by employee number.
 * Layout matches company Leave Report template (header block + yellow column headers).
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { drawCompanyPdfHeader, PDF_YELLOW_TABLE_HEAD_STYLES } from '@/lib/exportPdfReportLayout';
import { writeStyledXlsxReport, type CompanyProfileForExport } from '@/lib/exportXlsxReportLayout';

const REPORT_HEADERS = [
  'No.',
  'Emp No',
  'Employee Name',
  'Position',
  'Leave Type',
  'Leave Start Date',
  'Leave End Date',
  'Total Days',
  'Leave Duration',
  'Status',
  'Request Date',
  'Attachment',
  'Leave Reason',
] as const;

const LEAVE_REPORT_COLUMN_WIDTHS = [5, 10, 24, 18, 16, 15, 15, 10, 14, 12, 14, 18, 30];

interface LeaveRequestEmployee {
  employee_code: string;
  first_name: string;
  last_name: string;
  position: string | null;
}

interface LeaveRequestRow {
  leave_type: string;
  start_date: string;
  end_date: string;
  number_of_days: number | null;
  leave_duration_type: string | null;
  reason: string | null;
  status: string;
  attachment_url: string | null;
  created_at: string;
  employee: LeaveRequestEmployee | null;
}

type LeaveRequestQueryRow = Omit<LeaveRequestRow, 'employee'> & {
  employee: LeaveRequestEmployee | LeaveRequestEmployee[] | null;
};

function normalizeEmployeeJoin(
  employee: LeaveRequestEmployee | LeaveRequestEmployee[] | null | undefined
): LeaveRequestEmployee | null {
  if (!employee) return null;
  return Array.isArray(employee) ? employee[0] ?? null : employee;
}

function mapLeaveRequestRow(row: LeaveRequestQueryRow): LeaveRequestRow {
  return {
    ...row,
    employee: normalizeEmployeeJoin(row.employee),
  };
}

export interface ExportLeaveReportOptions {
  year: number;
  employeeIds?: string[];
  format: 'pdf' | 'csv' | 'xlsx';
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatStatus(status: string): string {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

const DURATION_LABELS: Record<string, string> = {
  fullday: 'Full Day',
  first_half: 'First Half',
  second_half: 'Second Half',
};

function formatDurationType(durationType: string | null | undefined): string {
  if (!durationType) return 'Full Day';
  return DURATION_LABELS[durationType] || durationType.replace(/_/g, ' ');
}

function employeeName(emp: LeaveRequestRow['employee']): string {
  if (!emp) return '—';
  return [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '—';
}

function attachmentLabel(url: string | null): string {
  if (!url) return '';
  try {
    const path = url.split('?')[0];
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    return name || 'Attached';
  } catch {
    return 'Attached';
  }
}

function escapeCsvField(val: string): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function companyPhone(profile: CompanyProfileForExport): string {
  return profile.mobile_number || profile.phone || '';
}

function buildDataRows(
  requests: LeaveRequestRow[],
  leaveTypeNames: Map<string, string>
): string[][] {
  const sorted = [...requests].sort((a, b) => {
    const codeA = a.employee?.employee_code || '';
    const codeB = b.employee?.employee_code || '';
    const codeCmp = codeA.localeCompare(codeB, undefined, { numeric: true });
    if (codeCmp !== 0) return codeCmp;
    return a.start_date.localeCompare(b.start_date);
  });

  return sorted.map((row, index) => {
    const emp = row.employee;
    return [
      String(index + 1),
      emp?.employee_code || '—',
      employeeName(emp),
      emp?.position || '—',
      leaveTypeNames.get(row.leave_type) || row.leave_type.toUpperCase(),
      formatDate(row.start_date),
      formatDate(row.end_date),
      row.number_of_days != null ? String(row.number_of_days) : '—',
      formatDurationType(row.leave_duration_type),
      formatStatus(row.status),
      formatDateTime(row.created_at),
      attachmentLabel(row.attachment_url),
      row.reason || '',
    ];
  });
}

function writeCsv(profile: CompanyProfileForExport, year: number, dataRows: string[][]): void {
  const lines: string[] = [
    'B1G',
    profile.name || 'B1G Corporation',
    profile.address || '',
    companyPhone(profile),
    '',
    'Leave Report',
    '',
    REPORT_HEADERS.map(escapeCsvField).join(','),
  ];

  if (dataRows.length === 0) {
    lines.push(
      Array(REPORT_HEADERS.length)
        .fill('')
        .map((_, i) => (i === 4 ? 'No Records' : ''))
        .map(escapeCsvField)
        .join(',')
    );
  } else {
    lines.push(...dataRows.map((row) => row.map(escapeCsvField).join(',')));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leave-report-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function writePdf(profile: CompanyProfileForExport, year: number, dataRows: string[][]): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const tableStartY = drawCompanyPdfHeader(doc, profile, 'Leave Report');

  const body =
    dataRows.length === 0
      ? [
          Array(REPORT_HEADERS.length)
            .fill('')
            .map((_, i) => (i === 4 ? 'No Records' : '')),
        ]
      : dataRows.map((row) => row.map((v) => String(v).slice(0, 80)));

  autoTable(doc, {
    startY: tableStartY,
    head: [REPORT_HEADERS.slice()],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: PDF_YELLOW_TABLE_HEAD_STYLES,
    margin: { left: 14, right: 14 },
  });

  doc.save(`leave-report-${year}.pdf`);
}

export async function exportLeaveReport(options: ExportLeaveReportOptions): Promise<void> {
  const { year, employeeIds, format } = options;

  const [profileRes, configRes] = await Promise.all([
    supabase.from('company_profile').select('name, address, phone, mobile_number').limit(1).maybeSingle(),
    supabase.from('leave_type_config').select('code, name'),
  ]);

  if (profileRes.error) throw new Error(`Failed to fetch company profile: ${profileRes.error.message}`);

  const profile: CompanyProfileForExport = profileRes.data || { name: 'B1G Corporation' };
  const leaveTypeNames = new Map<string, string>();
  (configRes.data || []).forEach((c: { code: string; name: string }) => {
    leaveTypeNames.set(c.code, c.name);
  });

  let requests: LeaveRequestRow[] = [];

  if (!employeeIds || employeeIds.length > 0) {
    let query = supabase
      .from('leave_requests')
      .select(
        `leave_type, start_date, end_date, number_of_days, leave_duration_type, reason, status, attachment_url, created_at,
         employee:employees!employee_id(employee_code, first_name, last_name, position)`
      )
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`);

    if (employeeIds && employeeIds.length > 0) {
      query = query.in('employee_id', employeeIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch leave requests: ${error.message}`);
    requests = ((data || []) as LeaveRequestQueryRow[]).map(mapLeaveRequestRow);
  }

  const dataRows = buildDataRows(requests, leaveTypeNames);

  if (format === 'xlsx') {
    writeStyledXlsxReport({
      profile,
      reportTitle: 'Leave Report',
      sheetName: 'Leave Report',
      filename: `leave-report-${year}.xlsx`,
      headers: [...REPORT_HEADERS],
      dataRows,
      columnWidths: LEAVE_REPORT_COLUMN_WIDTHS,
      emptyMessageCol: 4,
      titlePlacement: 'centered',
    });
  } else if (format === 'csv') {
    writeCsv(profile, year, dataRows);
  } else {
    writePdf(profile, year, dataRows);
  }
}
