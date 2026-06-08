/** Matches `public.holidays.type` and `attendance_records.holiday_type`. */
export type HolidayType = 'regular' | 'special' | 'company';

const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  regular: 'Regular',
  special: 'Special',
  company: 'Company',
};

const HOLIDAY_TYPE_BADGE: Record<HolidayType, string> = {
  regular: 'bg-blue-50 text-blue-700 border-blue-200',
  special: 'bg-amber-50 text-amber-700 border-amber-200',
  company: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function normalizeHolidayType(value: string | null | undefined): HolidayType | null {
  if (value === 'regular' || value === 'special' || value === 'company') return value;
  return null;
}

export function formatHolidayTypeLabel(value: string | null | undefined): string {
  const t = normalizeHolidayType(value);
  return t ? HOLIDAY_TYPE_LABELS[t] : 'Holiday';
}

export function holidayTypeBadgeClass(value: string | null | undefined): string {
  const t = normalizeHolidayType(value);
  return t ? HOLIDAY_TYPE_BADGE[t] : 'bg-indigo-50 text-indigo-700 border-indigo-200';
}

export function formatHolidayStatusLabel(value: string | null | undefined): string {
  const t = normalizeHolidayType(value);
  return t ? `Holiday (${HOLIDAY_TYPE_LABELS[t]})` : 'Holiday';
}
