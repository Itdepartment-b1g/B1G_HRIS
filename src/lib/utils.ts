import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Check if user has any of the given roles (supports multi-role) */
export function hasRole(
  user: { role?: string; roles?: string[] } | null,
  ...roles: string[]
): boolean {
  if (!user) return false;
  const userRoles = user.roles ?? (user.role ? [user.role] : []);
  return roles.some((r) => userRoles.includes(r));
}

/** Check if user can see nav item (has any of item's required roles) */
export function canSeeNavItem(
  user: { role?: string; roles?: string[] } | null,
  itemRoles?: string[]
): boolean {
  if (!itemRoles || itemRoles.length === 0) return true;
  return hasRole(user, ...itemRoles);
}

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
 * Avatar fallback: first letter of first name + last letter of last name.
 * Used when profile picture is not available.
 */
export function getAvatarFallback(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim()[0] ?? '';
  const last = (lastName ?? '').trim().slice(-1) ?? '';
  const result = (first + last).toUpperCase();
  return result || '?';
}

/**
 * Avatar fallback from full name (e.g. "Franco Romey" -> "Fy").
 * Parses "First Last" to first letter of first word + last letter of last word.
 */
export function getAvatarFallbackFromFullName(fullName?: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  const first = parts[0][0] ?? '';
  const last = (parts[parts.length - 1] ?? '').slice(-1) ?? '';
  return (first + last).toUpperCase() || '?';
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
