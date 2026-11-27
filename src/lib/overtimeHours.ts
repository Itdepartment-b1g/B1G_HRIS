/** Parse "19:00:00" to minutes from midnight */
export function parseTimeToMinutes(timeStr: string): number {
  const parts = (timeStr || '00:00').toString().split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/** Format a Date's local clock time as HH:MM:SS */
export function formatClockTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/**
 * Compute OT hours from recorded time-out vs shift end (matches validate_and_submit_overtime).
 * Uses full datetime so overnight outs (e.g. 3–4 AM next day) qualify, while same-day early outs do not.
 * Clock-time delta wraps +24h when negative; round down to 30 mins; min 1 hour.
 */
export function computeOTHours(
  timeOutRaw: string,
  shiftEndStr: string,
  otDate: string
): { valid: boolean; hours: number; timeOutStr: string } {
  const timeOutDate = new Date(timeOutRaw);
  const timeOutStr = formatClockTime(timeOutDate);
  const shiftEndMins = parseTimeToMinutes(shiftEndStr);
  const endH = Math.floor(shiftEndMins / 60);
  const endM = shiftEndMins % 60;
  const [y, mo, d] = otDate.split('-').map(Number);
  const shiftEndDate = new Date(y, mo - 1, d, endH, endM, 0);

  // Same gate as RPC: time_out must be after ot_date + shift_end
  if (!(timeOutDate.getTime() > shiftEndDate.getTime())) {
    return { valid: false, hours: 0, timeOutStr };
  }

  const timeOutMins = parseTimeToMinutes(timeOutStr);
  let rawMins = timeOutMins - shiftEndMins;
  if (rawMins < 0) rawMins += 24 * 60; // overnight wrap
  if (rawMins > 24 * 60) return { valid: false, hours: 0, timeOutStr };
  if (rawMins < 30) return { valid: false, hours: 0, timeOutStr };
  const roundedMins = Math.floor(rawMins / 30) * 30;
  if (roundedMins < 60) return { valid: false, hours: 0, timeOutStr };
  return { valid: true, hours: roundedMins / 60, timeOutStr };
}
