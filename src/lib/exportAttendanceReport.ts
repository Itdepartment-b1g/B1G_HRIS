/**
 * Attendance Export Report — CSV/XLSX
 * One row per active employee with Employee Number, Employee Name, NoOfHours (104),
 * undertime (sum of late hours past start), and absences.
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

const NO_OF_HOURS = 104;

export interface AttendanceReportRow {
  employeeNumber: string;
  employeeName: string;
  noOfHours: number;
  undertime: string;
  absences: number;
}

export interface ExportAttendanceReportOptions {
  dateFrom: string;
  dateTo: string;
  format: 'csv' | 'xlsx';
}

/**
 * Build and download attendance report.
 */
export async function exportAttendanceReport(options: ExportAttendanceReportOptions): Promise<void> {
  const { dateFrom, dateTo, format } = options;

  // Fetch all active employees
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, last_name')
    .eq('is_active', true)
    .order('employee_code');

  if (empError) {
    throw new Error(`Failed to fetch employees: ${empError.message}`);
  }

  // Fetch attendance records in date range
  const { data: records, error: recError } = await supabase
    .from('attendance_records')
    .select('employee_id, status, minutes_late')
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (recError) {
    throw new Error(`Failed to fetch attendance records: ${recError.message}`);
  }

  // Aggregate by employee: sum minutes_late for late/lti, count absent
  const agg = new Map<
    string,
    { sumMinutesLate: number; countAbsent: number }
  >();

  for (const r of records || []) {
    const empId = r.employee_id;
    if (!agg.has(empId)) {
      agg.set(empId, { sumMinutesLate: 0, countAbsent: 0 });
    }
    const curr = agg.get(empId)!;
    if (r.status === 'absent') {
      curr.countAbsent += 1;
    } else if (r.status === 'late' || r.status === 'lti') {
      curr.sumMinutesLate += r.minutes_late ?? 0;
    }
  }

  // Build rows: one per active employee
  const rows: AttendanceReportRow[] = (employees || []).map((emp) => {
    const a = agg.get(emp.id) ?? { sumMinutesLate: 0, countAbsent: 0 };
    const undertimeHours = a.sumMinutesLate / 60;
    return {
      employeeNumber: emp.employee_code || '',
      employeeName: [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '',
      noOfHours: NO_OF_HOURS,
      undertime: undertimeHours.toFixed(2),
      absences: a.countAbsent,
    };
  });

  const filename = `attendance-report-${dateFrom}-to-${dateTo}`;

  if (format === 'csv') {
    downloadCsv(rows, `${filename}.csv`);
  } else {
    downloadXlsx(rows, `${filename}.xlsx`);
  }
}

function escapeCsvField(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: AttendanceReportRow[], filename: string): void {
  const headers = ['Employee Number', 'Employee Name', 'NoOfHours', 'undertime', 'absences'];
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [r.employeeNumber, r.employeeName, r.noOfHours, r.undertime, r.absences]
        .map(escapeCsvField)
        .join(',')
    ),
  ];
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXlsx(rows: AttendanceReportRow[], filename: string): void {
  const wsData = [
    ['Employee Number', 'Employee Name', 'NoOfHours', 'undertime', 'absences'],
    ...rows.map((r) => [r.employeeNumber, r.employeeName, r.noOfHours, r.undertime, r.absences]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
  XLSX.writeFile(wb, filename);
}
