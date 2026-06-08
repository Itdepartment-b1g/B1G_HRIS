/**
 * Shared attendance aggregation for CSV/XLSX exports.
 */

import { supabase } from '@/lib/supabase';
import { computeFlexNetWorkedHours, computeFlexUndertimeMinutes } from '@/lib/flexAttendance';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

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

function getMinutesFromMidnightLocal(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function computeNetShiftHours(startTime: string, endTime: string, breakHours: number): number {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  return Math.max(0, Math.round((gross - breakHours) * 100) / 100);
}

function computeGrossShiftHours(startTime: string, endTime: string): number {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  return Math.max(0, Math.round(gross * 100) / 100);
}

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

export interface AttendanceExportEmployee {
  id: string;
  employee_code: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
}

export interface AttendanceExportAggTotals {
  /** Sum of credited hours in the export date range (present, paid leave, holidays, trips). */
  totalWorkedHours: number;
  sumUndertimeMinutes: number;
  absences: number;
  /** Count of regular/legal holiday days in the export date range */
  legalHolidayDays: number;
  /** Count of special holiday days in the export date range */
  specialHolidayDays: number;
}

export const EMPTY_ATTENDANCE_AGG: AttendanceExportAggTotals = {
  totalWorkedHours: 0,
  sumUndertimeMinutes: 0,
  absences: 0,
  legalHolidayDays: 0,
  specialHolidayDays: 0,
};

export interface AttendanceExportAggregateResult {
  employees: AttendanceExportEmployee[];
  aggByEmployeeId: Map<string, AttendanceExportAggTotals>;
}

export async function aggregateAttendanceExport(
  dateFrom: string,
  dateTo: string
): Promise<AttendanceExportAggregateResult> {
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, middle_name, last_name')
    .eq('is_active', true)
    .order('employee_code');

  if (empError) throw new Error(`Failed to fetch employees: ${empError.message}`);

  const { data: records, error: recError } = await supabase
    .from('attendance_records')
    .select(
      'employee_id, date, status, holiday_type, minutes_late, flex_undertime_minutes, time_in, time_out, leave_type_code, leave_duration_type, leave_day_fraction, business_trip_id'
    )
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (recError) throw new Error(`Failed to fetch attendance records: ${recError.message}`);

  const { data: leaveTypeConfigs } = await supabase.from('leave_type_config').select('code, pay_type');

  const payTypeByCode = new Map<string, string>();
  for (const ltc of leaveTypeConfigs || []) {
    payTypeByCode.set(ltc.code, ltc.pay_type || 'paid');
  }

  const { data: shiftData, error: shiftError } = await supabase
    .from('employee_shifts')
    .select(
      'employee_id, shift:shifts(start_time, end_time, break_total_hours, days, is_flexible, required_daily_hours, grace_period_minutes)'
    );

  if (shiftError) throw new Error(`Failed to fetch shifts: ${shiftError.message}`);

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
    const sh = (s as unknown as { shift: {
      start_time: string;
      end_time: string;
      break_total_hours: number;
      days?: string[];
      is_flexible?: boolean;
      required_daily_hours?: number;
      grace_period_minutes?: number;
    } | null }).shift;
    if (!sh) continue;
    const arr = shiftsByEmp.get(s.employee_id) || [];
    arr.push(sh);
    shiftsByEmp.set(s.employee_id, arr);
  }

  const aggByEmployeeId = new Map<string, AttendanceExportAggTotals>();

  for (const r of records || []) {
    const empId = r.employee_id;
    if (!aggByEmployeeId.has(empId)) {
      aggByEmployeeId.set(empId, { ...EMPTY_ATTENDANCE_AGG });
    }
    const curr = aggByEmployeeId.get(empId)!;

    const empShifts = shiftsByEmp.get(empId) || [];
    const weekday = getWeekday(r.date);
    const dayMatches = empShifts.filter((s) => s.days?.includes(weekday));
    const noDayRestriction = empShifts.filter((s) => !s.days?.length);
    const shiftCandidates = (
      dayMatches.length ? dayMatches : noDayRestriction.length ? noDayRestriction : empShifts
    ).filter((s) => !!s.start_time);
    shiftCandidates.sort((a, b) => {
      const aFlex = a.is_flexible ? 1 : 0;
      const bFlex = b.is_flexible ? 1 : 0;
      if (aFlex !== bFlex) return aFlex - bFlex;
      return parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
    });
    const shiftForDay = shiftCandidates[0];
    const breakHrs = shiftForDay?.break_total_hours ?? 0;
    const isFlexibleShift = !!shiftForDay?.is_flexible;
    const requiredDailyHours = shiftForDay?.required_daily_hours ?? 8;

    if ((r as { business_trip_id?: string | null }).business_trip_id) {
      const netShiftHrs = shiftForDay
        ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
        : 8;
      curr.totalWorkedHours += netShiftHrs;
      continue;
    }

    if (r.status === 'holiday') {
      const netShiftHrs = shiftForDay
        ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
        : 8;
      const holidayType = (r as { holiday_type?: string | null }).holiday_type;
      if (holidayType === 'special') {
        curr.specialHolidayDays += 1;
      } else if (holidayType === 'regular') {
        curr.legalHolidayDays += 1;
      }
      // All holiday types credit shift hours toward NoOfHours (summary export total for the period).
      curr.totalWorkedHours += netShiftHrs;
      continue;
    }

    const leaveCode = (r as { leave_type_code?: string | null }).leave_type_code ?? null;
    const leaveFraction = ((r as { leave_day_fraction?: number | null }).leave_day_fraction as number | null) ?? null;
    const duration = (r as { leave_duration_type?: string | null }).leave_duration_type ?? null;
    const isHalfDayLeave = duration === 'first_half' || duration === 'second_half' || leaveFraction === 0.5;
    const isFullDayLeaveRow = r.status === 'on_leave';
    const isHalfDayTaggedPresent = r.status === 'present' && isHalfDayLeave && !!leaveCode;
    const payType = leaveCode ? payTypeByCode.get(leaveCode) : 'paid';
    const netShiftHrs = shiftForDay
      ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
      : 8;
    let skipWorkedHoursFromTimeInOut = false;

    if (isFullDayLeaveRow) {
      if (payType === 'unpaid') curr.absences += 1;
      else curr.totalWorkedHours += netShiftHrs;
      continue;
    }

    if (isHalfDayTaggedPresent) {
      if (payType === 'unpaid') {
        curr.absences += 0.5;
      } else {
        curr.totalWorkedHours += netShiftHrs;
        skipWorkedHoursFromTimeInOut = true;
      }
    }

    if (r.status === 'absent') {
      curr.absences += 1;
    } else if (r.status === 'half_day') {
      curr.absences += 0.5;
    }

    let undertimeMinutes = 0;

    const leaveCodeForUndertime = (r as { leave_type_code?: string | null }).leave_type_code ?? null;
    const durationForUndertime = (r as { leave_duration_type?: string | null }).leave_duration_type ?? null;
    const isHalfDay = durationForUndertime === 'first_half' || durationForUndertime === 'second_half';

    if (isHalfDay && r.time_in && shiftForDay?.start_time && shiftForDay?.end_time && leaveCodeForUndertime) {
      const grace = Math.max(0, shiftForDay.grace_period_minutes ?? 0);
      const workingStart =
        durationForUndertime === 'first_half'
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
        const timeInM = getMinutesFromMidnightLocal(r.time_in);
        const startM = parseTimeToMinutes(shiftForDay.start_time);
        const recomputedLate = timeInM > startM ? Math.floor(timeInM - startM) : 0;
        if (recomputedLate > 0) undertimeMinutes += recomputedLate;
      }
    } else if (r.minutes_late != null && Number(r.minutes_late) > 0) {
      undertimeMinutes += Math.floor(Number(r.minutes_late));
    }

    if (!isHalfDay && r.time_out && shiftForDay && !isFlexibleShift) {
      const timeOutMinutes = getMinutesFromMidnightManila(r.time_out);
      const shiftEndMinutes = parseTimeToMinutes(shiftForDay.end_time);
      if (timeOutMinutes < shiftEndMinutes) {
        undertimeMinutes += shiftEndMinutes - timeOutMinutes;
      }
    }

    if (r.time_in && !r.time_out && shiftForDay) {
      const halfShiftMinutes = isFlexibleShift
        ? Math.floor(((requiredDailyHours ?? 8) / 2) * 60)
        : Math.floor((computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs) / 2) * 60);
      undertimeMinutes += halfShiftMinutes;
    }

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
          const netShiftHrsForDay = shiftForDay
            ? computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs)
            : rawHours;
          const grossShiftHrs = shiftForDay
            ? computeGrossShiftHours(shiftForDay.start_time, shiftForDay.end_time)
            : rawHours;
          let isCompletedShift = false;
          if (shiftForDay) {
            const timeOutM = getMinutesFromMidnightManila(r.time_out);
            const startM = parseTimeToMinutes(shiftForDay.start_time);
            const endM = parseTimeToMinutes(shiftForDay.end_time);
            if (endM >= startM) {
              isCompletedShift = timeOutM >= endM;
            } else {
              isCompletedShift = timeOutM >= endM && timeOutM < startM;
            }
          }
          if (isCompletedShift) {
            curr.totalWorkedHours += netShiftHrsForDay;
          } else {
            const breakDeduction = rawHours >= grossShiftHrs * 0.9 ? breakHrs : 0;
            const actualHrs = Math.min(Math.max(0, rawHours - breakDeduction), netShiftHrsForDay);
            curr.totalWorkedHours += actualHrs;
          }
        }
      }
    }

    if (!skipWorkedHoursFromTimeInOut && r.time_in && !r.time_out && shiftForDay) {
      const fullShiftHours = isFlexibleShift
        ? (requiredDailyHours ?? 8)
        : computeNetShiftHours(shiftForDay.start_time, shiftForDay.end_time, breakHrs);
      curr.totalWorkedHours += fullShiftHours;
    }

    if (isFlexibleShift) {
      const storedFlex = (r as { flex_undertime_minutes?: number | null }).flex_undertime_minutes ?? null;
      const computedFlex =
        r.time_in && r.time_out
          ? computeFlexUndertimeMinutes({
              timeInIso: r.time_in,
              timeOutIso: r.time_out,
              breakTotalHours: breakHrs,
              requiredDailyHours,
            })
          : 0;
      undertimeMinutes = Math.max(undertimeMinutes, storedFlex != null ? storedFlex : computedFlex);
    }

    curr.sumUndertimeMinutes += undertimeMinutes;
  }

  return {
    employees: (employees || []) as AttendanceExportEmployee[],
    aggByEmployeeId,
  };
}
