/**
 * Attendance Export Report — CSV/XLSX
 * One row per active employee with:
 *   Employee Number, Employee Name,
 *   NoOfHours   — actual hours worked (time_out − time_in − break), capped at net shift hours.
 *                 For paid leaves (on_leave + pay_type='paid'), full net shift hours are added.
 *   Undertime   — sum of late minutes (past shift start) + early-out minutes (before shift end),
 *   Absences    — absent = 1 day, half_day = 0.5 day.
 *                 For unpaid leaves (on_leave + pay_type='unpaid'), 1 day is added.
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
// NOTE: We intentionally do not rely on `computeAttendanceStatusFromTimeIn()` for recomputing
// minutes late in the export because it zeroes out minutes late for flexible shifts.
import { computeFlexNetWorkedHours, computeFlexUndertimeMinutes } from '@/lib/flexAttendance';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse "HH:MM:SS" or "HH:MM" to minutes from midnight */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/** Get minutes from midnight for a timestamptz ISO string in Asia/Manila */
function getMinutesFromMidnightManila(isoTimestamp: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(isoTimestamp));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const s = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
  return h * 60 + m + s / 60;
}

/** Get minutes from midnight using the browser/server local timezone */
function getMinutesFromMidnightLocal(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Compute net working hours for a shift (gross hours minus break) */
function computeNetShiftHours(startTime: string, endTime: string, breakHours: number): number {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  return Math.max(0, Math.round((gross - breakHours) * 100) / 100);
}

/** Compute gross shift hours (no break deduction) */
function computeGrossShiftHours(startTime: string, endTime: string): number {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  return Math.max(0, Math.round(gross * 100) / 100);
}

/** Get abbreviated weekday name from a YYYY-MM-DD string */
function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return WEEKDAY_NAMES[d.getDay()];
}

function computeHalfDayMidpointTime(opts: { start_time: string; end_time: string; break_total_hours?: number }): string {
  const startM = parseTimeToMinutes(opts.start_time);
  const endM = parseTimeToMinutes(opts.end_time);
  const grossMinutes = endM >= startM ? endM - startM : 24 * 60 - startM + endM;
  const breakMinutes = Math.round((opts.break_total_hours ?? 0) * 60);
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);
  const midMinutes = startM + Math.floor(netMinutes / 2) + breakMinutes;
  const hh = Math.floor((midMinutes % (24 * 60)) / 60)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor(midMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hh}:${mm}:00`;
}

export interface AttendanceReportRow {
  employeeNumber: string;
  employeeName: string;
  noOfHours: string;
  undertime: string;
  absences: string;
  // Overtime & premium pay columns (placeholder values)
  regularOT: string;
  restDay: string;
  restDayOT: string;
  specialHoliday1: string;
  specialHoliday2: string;
  specialHoliday3: string;
  specialHoliday4: string;
  legalHoliday1: string;
  legalHoliday2: string;
  legalHoliday3: string;
  legalHolidayRestDayOT: string;
  nightDiffReg1: string;
  nightDiffReg2: string;
  nightDiffRes1: string;
  nightDiffRes2: string;
  nightDiffSpe1: string;
  nightDiffSpe2: string;
  nightDiffSpe3: string;
  nightDiffSpe4: string;
  nightDiffLeg1: string;
  nightDiffLeg2: string;
  nightDiffLeg3: string;
  nightDiffLeg4: string;
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
    .select('id, employee_code, first_name, middle_name, last_name')
    .eq('is_active', true)
    .order('employee_code');

  if (empError) throw new Error(`Failed to fetch employees: ${empError.message}`);

  // 2. Fetch attendance records in date range (include time_in/time_out + leave_type_code)
  const { data: records, error: recError } = await supabase
    .from('attendance_records')
    .select('employee_id, date, status, minutes_late, flex_undertime_minutes, time_in, time_out, leave_type_code, leave_duration_type, leave_day_fraction, business_trip_id')
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (recError) throw new Error(`Failed to fetch attendance records: ${recError.message}`);

  // 2b. Fetch leave_type_config to determine pay_type (paid/unpaid) for on_leave records
  const { data: leaveTypeConfigs } = await supabase
    .from('leave_type_config')
    .select('code, pay_type');

  // Build lookup: leave code → pay_type ('paid' | 'unpaid')
  const payTypeByCode = new Map<string, string>();
  for (const ltc of leaveTypeConfigs || []) {
    payTypeByCode.set(ltc.code, ltc.pay_type || 'paid');
  }

  // 3. Fetch employee shifts (to compute net hours per working day)
  const { data: shiftData, error: shiftError } = await supabase
    .from('employee_shifts')
    .select('employee_id, shift:shifts(start_time, end_time, break_total_hours, days, is_flexible, required_daily_hours, grace_period_minutes)');

  if (shiftError) throw new Error(`Failed to fetch shifts: ${shiftError.message}`);

  // Build shift lookup: employee_id → array of shifts
  const shiftsByEmp = new Map<
    string,
    Array<{
      start_time: string;
      end_time: string;
      break_total_hours: number;
      days?: string[];
      is_flexible?: boolean;
      required_daily_hours?: number;
      grace_period_minutes?: number;
    }>
  >();
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

    // Look up shift for this day (used by NoOfHours, Undertime, and on_leave paid hours)
    const empShifts = shiftsByEmp.get(empId) || [];
    const weekday = getWeekday(r.date);
    // Pick a deterministic shift for this weekday:
    // 1) Prefer shifts whose `days` includes this weekday.
    // 2) Otherwise prefer shifts with no `days` restriction.
    // 3) Prefer non-flexible shifts (is_flexible=false) to keep late-minute logic consistent.
    // 4) Tie-break by earliest start_time.
    const dayMatches = empShifts.filter((s) => s.days?.includes(weekday));
    const noDayRestriction = empShifts.filter((s) => !s.days?.length);
    const shiftCandidates = (dayMatches.length ? dayMatches : noDayRestriction.length ? noDayRestriction : empShifts).filter((s) => !!s.start_time);
    shiftCandidates.sort((a, b) => {
      const aFlex = a.is_flexible ? 1 : 0;
      const bFlex = b.is_flexible ? 1 : 0;
      if (aFlex !== bFlex) return aFlex - bFlex; // non-flex first
      return parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
    });
    const shiftForDay = shiftCandidates[0];
    const breakHrs = shiftForDay?.break_total_hours ?? 0;
    const isFlexibleShift = !!shiftForDay?.is_flexible;
    const requiredDailyHours = shiftForDay?.required_daily_hours ?? 8;

    // Business Trip: approved trip days are temporarily exempt from time_in/out
    // Treat as paid present day (full net shift hours), no undertime/late.
    if ((r as any).business_trip_id) {
      const netShiftHrs = shiftForDay
        ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
        : 8;
      curr.totalWorkedHours += netShiftHrs;
      continue;
    }

    // --- Handle leave credit using pay_type for either:
    //  - full-day leave rows (status='on_leave')
    //  - half-day leave rows that remain status='present' but are tagged with leave_type_code + duration
    //
    // Business rules (per requirement):
    //  - Half-day + PAID  : NoOfHours credits FULL shift hours (e.g. 8) regardless of actual worked hours
    //  - Half-day + UNPAID: NoOfHours counts ONLY actual worked hours (e.g. ~4); unpaid half counts as absence (0.5)
    const leaveCode = (r as any).leave_type_code as string | null;
    const leaveFraction = ((r as any).leave_day_fraction as number | null) ?? null;
    const duration = (r as any).leave_duration_type as string | null;
    const isHalfDayLeave = duration === 'first_half' || duration === 'second_half' || leaveFraction === 0.5;
    const isFullDayLeaveRow = r.status === 'on_leave';
    const isHalfDayTaggedPresent = r.status === 'present' && isHalfDayLeave && !!leaveCode;
    const payType = leaveCode ? payTypeByCode.get(leaveCode) : 'paid';
    const netShiftHrs = shiftForDay ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs) : 8;
    let skipWorkedHoursFromTimeInOut = false;

    if (isFullDayLeaveRow) {
      if (payType === 'unpaid') curr.absences += 1;
      else curr.totalWorkedHours += netShiftHrs;
      continue; // nothing to compute from time_in/out
    }

    if (isHalfDayTaggedPresent) {
      if (payType === 'unpaid') {
        curr.absences += 0.5;
        // Do NOT add leave hours; only actual work hours will be counted below (from time_in/out)
      } else {
        // Paid half-day: credit full shift hours; do not add actual worked hours to avoid double counting
        curr.totalWorkedHours += netShiftHrs;
        skipWorkedHoursFromTimeInOut = true;
      }
    }

    // Absences: absent = 1 day, half_day = 0.5 day
    if (r.status === 'absent') {
      curr.absences += 1;
    } else if (r.status === 'half_day') {
      curr.absences += 0.5;
    }

    // Undertime = late minutes (time_in past shift start) + early-out minutes (time_out before shift end)
    let undertimeMinutes = 0;

    const leaveCodeForUndertime = (r as any).leave_type_code as string | null;
    const durationForUndertime = (r as any).leave_duration_type as string | null;
    const isHalfDay = durationForUndertime === 'first_half' || durationForUndertime === 'second_half';

    // Late:
    // - Half-day: recompute from half-day working start + grace (matches Attendance grid).
    // - Normal shift: use DB minutes_late when set; if null/0, recompute from time_in vs shift
    //   start using the same logic as the Attendance grid.
    if (isHalfDay && r.time_in && shiftForDay?.start_time && shiftForDay?.end_time && leaveCodeForUndertime) {
      const grace = Math.max(0, shiftForDay.grace_period_minutes ?? 0);
      const workingStart = durationForUndertime === 'first_half'
        ? computeHalfDayMidpointTime({
            start_time: shiftForDay.start_time,
            end_time: shiftForDay.end_time,
            break_total_hours: breakHrs,
          })
        : shiftForDay.start_time;
      const timeInM = getMinutesFromMidnightLocal(r.time_in);
      const startM = parseTimeToMinutes(workingStart);
      const late = timeInM > startM + grace ? Math.floor(timeInM - (startM + grace)) : 0;
      undertimeMinutes += late;
    } else if (!isHalfDay && r.time_in && shiftForDay?.start_time) {
      const storedLate = r.minutes_late != null ? Number(r.minutes_late) : 0;
      if (storedLate > 0) {
        undertimeMinutes += Math.floor(storedLate);
      } else {
        // Attendance grid behavior for normal-day late:
        // when DB minutes_late is null/0, recompute from time_in vs shift start (local time).
        // We recompute directly here to avoid flexible-shift short-circuiting.
        const timeInM = getMinutesFromMidnightLocal(r.time_in);
        const startM = parseTimeToMinutes(shiftForDay.start_time);
        const recomputedLate = timeInM > startM ? Math.floor(timeInM - startM) : 0;
        if (recomputedLate > 0) undertimeMinutes += recomputedLate;
      }
    } else if (r.minutes_late != null && Number(r.minutes_late) > 0) {
      undertimeMinutes += Math.floor(Number(r.minutes_late));
    }

    // Early out:
    // Keep normal-day logic, but for half-day leave we do NOT compute early-out against the full shift,
    // because the employee is expected to work only a half block.
    if (!isHalfDay && r.time_out && shiftForDay && !isFlexibleShift) {
      const timeOutMinutes = getMinutesFromMidnightManila(r.time_out);
      const shiftEndMinutes = parseTimeToMinutes(shiftForDay.end_time);
      if (timeOutMinutes < shiftEndMinutes) {
        undertimeMinutes += shiftEndMinutes - timeOutMinutes;
      }
    }

    // Missing time_out rule:
    // Export requirement: if employee timed in but has no time out,
    // deduct half of the shift (net for fixed, required for flex).
    if (r.time_in && !r.time_out && shiftForDay) {
      const halfShiftMinutes = isFlexibleShift
        ? Math.floor(((requiredDailyHours ?? 8) / 2) * 60)
        : Math.floor((computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs) / 2) * 60);
      undertimeMinutes += halfShiftMinutes;
    }

    // NoOfHours: actual hours worked = (time_out − time_in) minus break (only when span covers the full shift), capped at net shift hours
    if (!skipWorkedHoursFromTimeInOut && r.time_in && r.time_out) {
      if (isFlexibleShift) {
        const netWorked = computeFlexNetWorkedHours({
          timeInIso: r.time_in,
          timeOutIso: r.time_out,
          breakTotalHours: breakHrs,
          requiredDailyHours,
        });
        curr.totalWorkedHours += Math.min(netWorked, requiredDailyHours);
      } else {
        const rawMs = new Date(r.time_out).getTime() - new Date(r.time_in).getTime();
        if (rawMs > 0) {
          const rawHours = rawMs / 3600000;
          const netShiftHrs = shiftForDay
            ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
            : rawHours;
          const grossShiftHrs = shiftForDay ? computeGrossShiftHours(shiftForDay.start_time, shiftForDay.end_time) : rawHours;
          // Fixed-shift rule:
          // Late employees should still be counted as a full net workday (NoOfHours),
          // as long as they timed out at/after the scheduled shift end.
          //
          // Late affects `Undertime` via `minutes_late`, not reduced `NoOfHours` (export-only behavior).
          let isCompletedShift = false;
          if (shiftForDay) {
            const timeOutM = getMinutesFromMidnightManila(r.time_out);
            const startM = parseTimeToMinutes(shiftForDay.start_time);
            const endM = parseTimeToMinutes(shiftForDay.end_time);

            if (endM >= startM) {
              // Same-day shift
              isCompletedShift = timeOutM >= endM;
            } else {
              // Overnight shift: end is on next day (smaller endM)
              isCompletedShift = timeOutM >= endM && timeOutM < startM;
            }
          }

          if (isCompletedShift) {
            curr.totalWorkedHours += netShiftHrs;
          } else {
            // For incomplete days (early-out), fall back to previous timestamp-based calculation.
            // Only deduct break if the employee worked a span that roughly covers the whole shift.
            const breakDeduction = rawHours >= grossShiftHrs * 0.9 ? breakHrs : 0;
            const actualHrs = Math.min(Math.max(0, rawHours - breakDeduction), netShiftHrs);
            curr.totalWorkedHours += actualHrs;
          }
        }
      }
    }

    // No time out rule for NoOfHours (export-only):
    // If employee timed in but forgot to time out, do NOT reduce credited hours.
    // Only `Undertime` should be populated for the missing time_out.
    if (!skipWorkedHoursFromTimeInOut && r.time_in && !r.time_out && shiftForDay) {
      const fullShiftHours = isFlexibleShift
        ? requiredDailyHours ?? 8
        : computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs);
      curr.totalWorkedHours += fullShiftHours;
    }

    if (isFlexibleShift) {
      const storedFlex = (r as any).flex_undertime_minutes as number | null;
      const computedFlex =
        r.time_in && r.time_out
          ? computeFlexUndertimeMinutes({
              timeInIso: r.time_in,
              timeOutIso: r.time_out,
              breakTotalHours: breakHrs,
              requiredDailyHours,
            })
          : 0;
      undertimeMinutes = Math.max(
        undertimeMinutes,
        storedFlex != null ? storedFlex : computedFlex
      );
    }

    curr.sumUndertimeMinutes += undertimeMinutes;
  }

  const EMPTY_PREMIUM = '0';

  // 5. Build rows: one per active employee
  const rows: AttendanceReportRow[] = (employees || []).map((emp) => {
    const a = agg.get(emp.id) ?? { totalWorkedHours: 0, sumUndertimeMinutes: 0, absences: 0 };
    const undertimeHours = a.sumUndertimeMinutes / 60;
    const middle = (emp as any).middle_name ? String((emp as any).middle_name).trim() : '';
    const mi = middle ? `${middle[0]?.toUpperCase() || ''}.` : '';
    const last = emp.last_name ? String(emp.last_name).trim() : '';
    const first = emp.first_name ? String(emp.first_name).trim() : '';
    const base = [last, first].filter(Boolean).join(', ');
    const employeeName = [base, mi].filter(Boolean).join(' ').trim() || first || 'Unknown';
    return {
      employeeNumber: emp.employee_code || '',
      employeeName,
      noOfHours: a.totalWorkedHours.toFixed(2),
      undertime: undertimeHours.toFixed(2),
      absences: a.absences % 1 === 0 ? String(a.absences) : a.absences.toFixed(1),
      regularOT: EMPTY_PREMIUM,
      restDay: EMPTY_PREMIUM,
      restDayOT: EMPTY_PREMIUM,
      specialHoliday1: EMPTY_PREMIUM,
      specialHoliday2: EMPTY_PREMIUM,
      specialHoliday3: EMPTY_PREMIUM,
      specialHoliday4: EMPTY_PREMIUM,
      legalHoliday1: EMPTY_PREMIUM,
      legalHoliday2: EMPTY_PREMIUM,
      legalHoliday3: EMPTY_PREMIUM,
      legalHolidayRestDayOT: EMPTY_PREMIUM,
      nightDiffReg1: EMPTY_PREMIUM,
      nightDiffReg2: EMPTY_PREMIUM,
      nightDiffRes1: EMPTY_PREMIUM,
      nightDiffRes2: EMPTY_PREMIUM,
      nightDiffSpe1: EMPTY_PREMIUM,
      nightDiffSpe2: EMPTY_PREMIUM,
      nightDiffSpe3: EMPTY_PREMIUM,
      nightDiffSpe4: EMPTY_PREMIUM,
      nightDiffLeg1: EMPTY_PREMIUM,
      nightDiffLeg2: EMPTY_PREMIUM,
      nightDiffLeg3: EMPTY_PREMIUM,
      nightDiffLeg4: EMPTY_PREMIUM,
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

const REPORT_HEADERS = [
  'Employee Number',
  'Employee Name',
  'NoOfHours',
  'Undertime',
  'Absences',
  'RegularOT',
  'RestDay',
  'RestDayOT',
  'SpecialHoliday1',
  'SpecialHoliday2',
  'SpecialHoliday3',
  'SpecialHoliday4',
  'LegalHoliday1',
  'LegalHoliday2',
  'LegalHoliday3',
  'LegalHolidayRestDayOT',
  'NightDiffReg1',
  'NightDiffReg2',
  'NightDiffRes1',
  'NightDiffRes2',
  'NightDiffSpe1',
  'NightDiffSpe2',
  'NightDiffSpe3',
  'NightDiffSpe4',
  'NightDiffLeg1',
  'NightDiffLeg2',
  'NightDiffLeg3',
  'NightDiffLeg4',
];

function rowToArray(r: AttendanceReportRow): (string | number)[] {
  return [
    r.employeeNumber,
    r.employeeName,
    r.noOfHours,
    r.undertime,
    r.absences,
    r.regularOT,
    r.restDay,
    r.restDayOT,
    r.specialHoliday1,
    r.specialHoliday2,
    r.specialHoliday3,
    r.specialHoliday4,
    r.legalHoliday1,
    r.legalHoliday2,
    r.legalHoliday3,
    r.legalHolidayRestDayOT,
    r.nightDiffReg1,
    r.nightDiffReg2,
    r.nightDiffRes1,
    r.nightDiffRes2,
    r.nightDiffSpe1,
    r.nightDiffSpe2,
    r.nightDiffSpe3,
    r.nightDiffSpe4,
    r.nightDiffLeg1,
    r.nightDiffLeg2,
    r.nightDiffLeg3,
    r.nightDiffLeg4,
  ];
}

function downloadCsv(rows: AttendanceReportRow[], filename: string): void {
  const lines = [
    REPORT_HEADERS.join(','),
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

function downloadXlsx(rows: AttendanceReportRow[], filename: string): void {
  const wsData = [REPORT_HEADERS, ...rows.map((r) => rowToArray(r))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
  XLSX.writeFile(wb, filename);
}
