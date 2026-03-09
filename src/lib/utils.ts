import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Philippine mobile format: 09XX XXX XXXX (11 digits) or +63 9XX XXX XXXX
 * Formats input as user types
 */
export function formatPhonePH(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('63')) {
    const rest = digits.slice(2, 12);
    if (rest.length <= 3) return `+63 ${rest}`;
    if (rest.length <= 6) return `+63 ${rest.slice(0, 3)} ${rest.slice(3)}`;
    return `+63 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  }
  const d = digits.startsWith('0') ? digits : '0' + digits;
  const rest = d.slice(1, 11);
  if (rest.length <= 3) return `0${rest}`;
  if (rest.length <= 6) return `0${rest.slice(0, 3)} ${rest.slice(3)}`;
  return `0${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
}

/**
 * Normalize Philippine phone to +639XXXXXXXXX for storage
 */
export function normalizePhonePH(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length >= 12) return `+${digits.slice(0, 12)}`;
  if (digits.startsWith('0') && digits.length >= 11) return `+63${digits.slice(1, 11)}`;
  if (digits.startsWith('9') && digits.length >= 10) return `+63${digits.slice(0, 10)}`;
  if (digits.length >= 10) return `+63${digits.slice(-10)}`;
  return value;
}

/**
 * Validate Philippine mobile: 09XX XXX XXXX or +63 9XX XXX XXXX (must start with 9)
 */
export function isValidPhonePH(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return normalized.length === 10 && normalized.startsWith('9');
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
