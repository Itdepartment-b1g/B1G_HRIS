/**
 * Attendance summary export — CSV/XLSX
 * Compact column layout (EmployeeNumber, EmployeeName, NoOfHours, …).
 * NoOfHours — total credited hours in the date range (present, paid leave, all holiday types).
 * SpecialHoliday / LegalHoliday — day counts only (hours still included in NoOfHours).
 * EmployeeName is last name only.
 */

import * as XLSX from 'xlsx';
import { aggregateAttendanceExport, EMPTY_ATTENDANCE_AGG } from '@/lib/aggregateAttendanceExport';

const EMPTY_PREMIUM = '0';

export interface AttendanceReportSummaryRow {
  employeeNumber: string;
  employeeName: string;
  noOfHours: string;
  underTime: string;
  absenses: string;
  regularOT: string;
  restDay: string;
  restDayOT: string;
  specialHoliday: string;
  specialHolidayOT: string;
  specialHolidayRestDay: string;
  specialHolidayRestDayOT: string;
  legalHoliday: string;
  legalHolidayOT: string;
  legalHolidayRestday: string;
  legalHolidayRestdayOT: string;
  nightDiffRegular: string;
  nightDiffRegularOT: string;
  nightDiffRestDay: string;
  nightDiffRestDayOT: string;
  nightDiffSpecialHoliday: string;
  nightDiffSpecialHolidayOT: string;
  nightDiffSpecialHolidayRestDay: string;
  nightDiffSpecialHolidayRestDayOT: string;
  nightDiffLegalHoliday: string;
  nightDiffLegalHolidayOT: string;
  nightDiffLegalHolidayRestDay: string;
  nightDiffLegalHolidayRestDayOT: string;
}

export interface ExportAttendanceReportSummaryOptions {
  dateFrom: string;
  dateTo: string;
  format: 'csv' | 'xlsx';
}

const SUMMARY_HEADERS = [
  'EmployeeNumber',
  'EmployeeName',
  'NoOfHours',
  'UnderTime',
  'Absenses',
  'RegularOT',
  'RestDay',
  'RestDayOT',
  'SpecialHoliday',
  'SpecialHolidayOT',
  'SpecialHolidayRestDay',
  'SpecialHolidayRestDayOT',
  'LegalHoliday',
  'LegalHolidayOT',
  'LegalHolidayRestday',
  'LegalHolidayRestdayOT',
  'NightDiffRegular',
  'NightDiffRegularOT',
  'NightDiffRestDay',
  'NightDiffRestDayOT',
  'NightDiffSpecialHoliday',
  'NightDiffSpecialHolidayOT',
  'NightDiffSpecialHolidayRestDay',
  'NightDiffSpecialHolidayRestDayOT',
  'NightDiffLegalHoliday',
  'NightDiffLegalHolidayOT',
  'NightDiffLegalHolidayRestDay',
  'NightDiffLegalHolidayRestDayOT',
];

function formatHolidayDayCount(value: number): string {
  return value > 0 ? String(value) : EMPTY_PREMIUM;
}

function buildSummaryRows(
  employees: Awaited<ReturnType<typeof aggregateAttendanceExport>>['employees'],
  aggByEmployeeId: Awaited<ReturnType<typeof aggregateAttendanceExport>>['aggByEmployeeId']
): AttendanceReportSummaryRow[] {
  return employees.map((emp) => {
    const a = aggByEmployeeId.get(emp.id) ?? EMPTY_ATTENDANCE_AGG;
    const undertimeHours = a.sumUndertimeMinutes / 60;
    const lastName = emp.last_name ? String(emp.last_name).trim() : '';
    const employeeName = lastName || emp.first_name?.trim() || 'Unknown';

    return {
      employeeNumber: emp.employee_code || '',
      employeeName,
      noOfHours: a.totalWorkedHours.toFixed(2),
      underTime: undertimeHours.toFixed(2),
      absenses: a.absences % 1 === 0 ? String(a.absences) : a.absences.toFixed(1),
      regularOT: EMPTY_PREMIUM,
      restDay: EMPTY_PREMIUM,
      restDayOT: EMPTY_PREMIUM,
      specialHoliday: formatHolidayDayCount(a.specialHolidayDays),
      specialHolidayOT: EMPTY_PREMIUM,
      specialHolidayRestDay: EMPTY_PREMIUM,
      specialHolidayRestDayOT: EMPTY_PREMIUM,
      legalHoliday: formatHolidayDayCount(a.legalHolidayDays),
      legalHolidayOT: EMPTY_PREMIUM,
      legalHolidayRestday: EMPTY_PREMIUM,
      legalHolidayRestdayOT: EMPTY_PREMIUM,
      nightDiffRegular: EMPTY_PREMIUM,
      nightDiffRegularOT: EMPTY_PREMIUM,
      nightDiffRestDay: EMPTY_PREMIUM,
      nightDiffRestDayOT: EMPTY_PREMIUM,
      nightDiffSpecialHoliday: EMPTY_PREMIUM,
      nightDiffSpecialHolidayOT: EMPTY_PREMIUM,
      nightDiffSpecialHolidayRestDay: EMPTY_PREMIUM,
      nightDiffSpecialHolidayRestDayOT: EMPTY_PREMIUM,
      nightDiffLegalHoliday: EMPTY_PREMIUM,
      nightDiffLegalHolidayOT: EMPTY_PREMIUM,
      nightDiffLegalHolidayRestDay: EMPTY_PREMIUM,
      nightDiffLegalHolidayRestDayOT: EMPTY_PREMIUM,
    };
  });
}

function rowToArray(r: AttendanceReportSummaryRow): (string | number)[] {
  return [
    r.employeeNumber,
    r.employeeName,
    r.noOfHours,
    r.underTime,
    r.absenses,
    r.regularOT,
    r.restDay,
    r.restDayOT,
    r.specialHoliday,
    r.specialHolidayOT,
    r.specialHolidayRestDay,
    r.specialHolidayRestDayOT,
    r.legalHoliday,
    r.legalHolidayOT,
    r.legalHolidayRestday,
    r.legalHolidayRestdayOT,
    r.nightDiffRegular,
    r.nightDiffRegularOT,
    r.nightDiffRestDay,
    r.nightDiffRestDayOT,
    r.nightDiffSpecialHoliday,
    r.nightDiffSpecialHolidayOT,
    r.nightDiffSpecialHolidayRestDay,
    r.nightDiffSpecialHolidayRestDayOT,
    r.nightDiffLegalHoliday,
    r.nightDiffLegalHolidayOT,
    r.nightDiffLegalHolidayRestDay,
    r.nightDiffLegalHolidayRestDayOT,
  ];
}

function escapeCsvField(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: AttendanceReportSummaryRow[], filename: string): void {
  const lines = [
    SUMMARY_HEADERS.join(','),
    ...rows.map((r) => rowToArray(r).map(escapeCsvField).join(',')),
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

function downloadXlsx(rows: AttendanceReportSummaryRow[], filename: string): void {
  const wsData = [SUMMARY_HEADERS, ...rows.map((r) => rowToArray(r))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Summary');
  XLSX.writeFile(wb, filename);
}

export async function exportAttendanceReportSummary(
  options: ExportAttendanceReportSummaryOptions
): Promise<void> {
  const { dateFrom, dateTo, format } = options;
  const { employees, aggByEmployeeId } = await aggregateAttendanceExport(dateFrom, dateTo);
  const rows = buildSummaryRows(employees, aggByEmployeeId);
  const filename = `attendance-summary-report-${dateFrom}-to-${dateTo}`;

  if (format === 'csv') {
    downloadCsv(rows, `${filename}.csv`);
  } else {
    downloadXlsx(rows, `${filename}.xlsx`);
  }
}
