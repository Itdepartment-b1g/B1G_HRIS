import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert 24-hour time string (e.g. "08:00", "17:00:00") to 12-hour AM/PM format
 */
export function timeTo12Hour(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = (parts[1] ?? '00').padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${m} ${ampm}`;
}
