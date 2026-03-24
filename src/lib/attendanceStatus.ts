/**
 * Compute attendance status and minutes late based on time_in vs shift start.
 * - Minutes late = actual time_in − shift start_time (counted whenever past start)
 * - Status = present (when clocked in)
 */

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ShiftInfo {
  start_time: string; // "08:00:00" or "08:00"
  grace_period_minutes: number;
  days?: string[]; // e.g. ['Mon','Tue','Wed','Thu','Fri']
}

export interface EmployeeExemptions {
  late_exempted?: boolean;
  grace_period_exempted?: boolean;
}

/**
 * Get weekday name from a date string (YYYY-MM-DD) or Date
 */
export function getWeekdayForDate(dateInput: string | Date): string {
  const d = typeof dateInput === 'string'
    ? new Date(dateInput + (dateInput.includes('T') ? '' : 'T12:00:00'))
    : dateInput;
  return WEEKDAY_NAMES[d.getDay()];
}

/**
 * Parse "08:00:00" or "08:00" to minutes from midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 60 + m + s / 60;
}

/**
 * Get minutes from midnight for a given timestamp (in local time)
 */
function getMinutesFromMidnight(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';

export interface AttendanceStatusResult {
  status: AttendanceStatus;
  minutesLate: number;
}

/**
 * Compute attendance status and minutes late from time_in vs shift start.
 * Minutes late = time_in − shift.start_time whenever past start (for counting/display).
 */
export function computeAttendanceStatusFromTimeIn(params: {
  timeInIso: string | null;
  date: string; // YYYY-MM-DD
  shift: ShiftInfo | null;
  exemptions?: EmployeeExemptions;
  currentStoredStatus?: AttendanceStatus;
}): AttendanceStatusResult {
  const { timeInIso, date, shift, exemptions, currentStoredStatus } = params;

  if (!timeInIso) {
    return { status: currentStoredStatus ?? 'absent', minutesLate: 0 };
  }

  if (exemptions?.late_exempted || exemptions?.grace_period_exempted) {
    return { status: 'present', minutesLate: 0 };
  }

  if (!shift) {
    return { status: currentStoredStatus ?? 'present', minutesLate: 0 };
  }

  const timeInMinutes = getMinutesFromMidnight(timeInIso);
  const shiftStartMinutes = parseTimeToMinutes(shift.start_time);

  // Always present when clocked in. Minutes late = time past shift start (for counting)
  const minutesLate =
    timeInMinutes > shiftStartMinutes ? Math.floor(timeInMinutes - shiftStartMinutes) : 0;
  return { status: 'present', minutesLate };
}
