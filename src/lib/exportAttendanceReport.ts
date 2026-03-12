/**
 * Attendance Export Report — CSV/XLSX
 * One row per active employee with:
 *   Employee Number, Employee Name,
 *   NoOfHours   — actual hours worked (time_out − time_in − break), capped at net shift hours,
 *   Undertime   — sum of late minutes (past shift start) + early-out minutes (before shift end),
 *   Absences    — absent = 1 day, half_day = 0.5 day.
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse "HH:MM:SS" or "HH:MM" to minutes from midnight */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/** Compute net working hours for a shift (gross hours minus break) */
function computeNetShiftHours(startTime: string, endTime: string, breakHours: number): number {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  return Math.max(0, Math.round((gross - breakHours) * 100) / 100);
}

/** Get abbreviated weekday name from a YYYY-MM-DD string */
function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return WEEKDAY_NAMES[d.getDay()];
}

export interface AttendanceReportRow {
  employeeNumber: string;
  employeeName: string;
  noOfHours: string;
  undertime: string;
  absences: string;
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

  // 1. Fetch all active employees
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, last_name')
    .eq('is_active', true)
    .order('employee_code');

  if (empError) throw new Error(`Failed to fetch employees: ${empError.message}`);

  // 2. Fetch attendance records in date range (include time_in/time_out for actual hours)
  const { data: records, error: recError } = await supabase
    .from('attendance_records')
    .select('employee_id, date, status, minutes_late, time_in, time_out')
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (recError) throw new Error(`Failed to fetch attendance records: ${recError.message}`);

  // 3. Fetch employee shifts (to compute net hours per working day)
  const { data: shiftData, error: shiftError } = await supabase
    .from('employee_shifts')
    .select('employee_id, shift:shifts(start_time, end_time, break_total_hours, days)');

  if (shiftError) throw new Error(`Failed to fetch shifts: ${shiftError.message}`);

  // Build shift lookup: employee_id → array of shifts
  const shiftsByEmp = new Map<string, Array<{ start_time: string; end_time: string; break_total_hours: number; days?: string[] }>>();
  for (const s of shiftData || []) {
    const sh = (s as any).shift;
    if (!sh) continue;
    const arr = shiftsByEmp.get(s.employee_id) || [];
    arr.push(sh);
    shiftsByEmp.set(s.employee_id, arr);
  }

  // 4. Aggregate by employee
  const agg = new Map<
    string,
    { totalWorkedHours: number; sumUndertimeMinutes: number; absences: number }
  >();

  for (const r of records || []) {
    const empId = r.employee_id;
    if (!agg.has(empId)) {
      agg.set(empId, { totalWorkedHours: 0, sumUndertimeMinutes: 0, absences: 0 });
    }
    const curr = agg.get(empId)!;

    // Absences: absent = 1 day, half_day = 0.5 day
    if (r.status === 'absent') {
      curr.absences += 1;
    } else if (r.status === 'half_day') {
      curr.absences += 0.5;
    }

    // Look up shift for this day (used by both NoOfHours and Undertime)
    const empShifts = shiftsByEmp.get(empId) || [];
    const weekday = getWeekday(r.date);
    const shiftForDay = empShifts.find((s) => !s.days?.length || s.days.includes(weekday)) || empShifts[0];
    const breakHrs = shiftForDay?.break_total_hours ?? 0;

    // Undertime = late minutes (time_in past shift start) + early-out minutes (time_out before shift end)
    let undertimeMinutes = 0;

    // Late: minutes past shift start
    if (r.minutes_late && r.minutes_late > 0) {
      undertimeMinutes += r.minutes_late;
    }

    // Early out: minutes before shift end
    if (r.time_out && shiftForDay) {
      const timeOutDate = new Date(r.time_out);
      const timeOutMinutes = timeOutDate.getHours() * 60 + timeOutDate.getMinutes() + timeOutDate.getSeconds() / 60;
      const shiftEndMinutes = parseTimeToMinutes(shiftForDay.end_time);
      if (timeOutMinutes < shiftEndMinutes) {
        undertimeMinutes += shiftEndMinutes - timeOutMinutes;
      }
    }

    curr.sumUndertimeMinutes += undertimeMinutes;

    // NoOfHours: actual hours worked = (time_out − time_in) minus break, capped at net shift hours
    if (r.time_in && r.time_out) {
      const rawMs = new Date(r.time_out).getTime() - new Date(r.time_in).getTime();
      if (rawMs > 0) {
        const rawHours = rawMs / 3600000;
        const netShiftHrs = shiftForDay
          ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
          : rawHours;
        // Deduct break from raw hours, but don't go below 0, and cap at net shift hours
        const actualHrs = Math.min(Math.max(0, rawHours - breakHrs), netShiftHrs);
        curr.totalWorkedHours += actualHrs;
      }
    }
  }

  // 5. Build rows: one per active employee
  const rows: AttendanceReportRow[] = (employees || []).map((emp) => {
    const a = agg.get(emp.id) ?? { totalWorkedHours: 0, sumUndertimeMinutes: 0, absences: 0 };
    const undertimeHours = a.sumUndertimeMinutes / 60;
    return {
      employeeNumber: emp.employee_code || '',
      employeeName: [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '',
      noOfHours: a.totalWorkedHours.toFixed(2),
      undertime: undertimeHours.toFixed(2),
      absences: a.absences % 1 === 0 ? String(a.absences) : a.absences.toFixed(1),
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
  const headers = ['Employee Number', 'Employee Name', 'NoOfHours', 'Undertime', 'Absences'];
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
    ['Employee Number', 'Employee Name', 'NoOfHours', 'Undertime', 'Absences'],
    ...rows.map((r) => [r.employeeNumber, r.employeeName, r.noOfHours, r.undertime, r.absences]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
  XLSX.writeFile(wb, filename);
}
