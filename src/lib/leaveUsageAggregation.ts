/**
 * Sum approved leave_requests by employee and leave type for a given year.
 */

import { supabase } from '@/lib/supabase';

export type LeaveUsageMap = Map<string, Record<string, number>>;

interface LeaveUsageRow {
  employee_id: string;
  leave_type: string;
  number_of_days: number | null;
}

export async function fetchApprovedLeaveUsageByYear(
  year: number,
  employeeIds?: string[]
): Promise<LeaveUsageMap> {
  const usageMap: LeaveUsageMap = new Map();

  if (employeeIds && employeeIds.length === 0) {
    return usageMap;
  }

  let query = supabase
    .from('leave_requests')
    .select('employee_id, leave_type, number_of_days')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`);

  if (employeeIds && employeeIds.length > 0) {
    query = query.in('employee_id', employeeIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch leave usage: ${error.message}`);

  (data as LeaveUsageRow[] | null)?.forEach((row) => {
    const code = (row.leave_type || '').toLowerCase();
    if (!code) return;
    const days = Number(row.number_of_days ?? 0);
    if (!Number.isFinite(days) || days <= 0) return;

    const byType = usageMap.get(row.employee_id) ?? {};
    byType[code] = (byType[code] ?? 0) + days;
    usageMap.set(row.employee_id, byType);
  });

  return usageMap;
}

export function getUsedDays(usageMap: LeaveUsageMap, employeeId: string, leaveTypeCode: string): number {
  return usageMap.get(employeeId)?.[leaveTypeCode.toLowerCase()] ?? 0;
}

export function formatUsedDays(days: number): string {
  return String(days);
}
