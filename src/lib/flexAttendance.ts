export interface FlexHoursInput {
  timeInIso: string | null;
  timeOutIso: string | null;
  breakTotalHours?: number | null;
  requiredDailyHours?: number | null;
}

/**
 * Keeps break deduction consistent with export logic:
 * deduct break only when worked span is close to a full flex day.
 */
export function computeFlexNetWorkedHours(input: FlexHoursInput): number {
  const { timeInIso, timeOutIso } = input;
  if (!timeInIso || !timeOutIso) return 0;

  const breakHours = Math.max(0, input.breakTotalHours ?? 0);
  const requiredHours = Math.max(0, input.requiredDailyHours ?? 8);
  const rawMs = new Date(timeOutIso).getTime() - new Date(timeInIso).getTime();
  if (rawMs <= 0) return 0;

  const rawHours = rawMs / 3600000;
  const grossThreshold = requiredHours + breakHours;
  const breakDeduction = rawHours >= grossThreshold * 0.9 ? breakHours : 0;
  const net = Math.max(0, rawHours - breakDeduction);
  return Math.round(net * 100) / 100;
}

export function computeFlexUndertimeMinutes(input: FlexHoursInput): number {
  const requiredHours = Math.max(0, input.requiredDailyHours ?? 8);
  const net = computeFlexNetWorkedHours(input);
  return Math.max(0, Math.floor((requiredHours - net) * 60));
}
