/**
 * Reconstruct CTO history from approved overtime credits and approved CTO leave usage.
 * Conversion matches approve_overtime_request: ROUND(hours / 8, 3) → 1h = 0.125 CTO.
 */

import { supabase } from '@/lib/supabase';

export const OT_HOURS_PER_CTO_DAY = 8;

export type CtoHistorySource = 'overtime' | 'leave';

export interface CtoHistoryPerson {
  first_name: string | null;
  last_name: string | null;
  employee_code?: string | null;
}

export interface CtoHistoryDetails {
  filedBy: string;
  filedAt: string | null;
  filedOnBehalf: boolean;
  approvedBy: string;
  approvedAt: string | null;
  status: string;
  reason: string | null;
  attachmentUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  endDate: string | null;
  durationType: string | null;
}

export interface CtoHistoryRow {
  id: string;
  date: string;
  source: CtoHistorySource;
  sourceLabel: string;
  otHours: number | null;
  ctoDelta: number;
  runningTotal: number;
  details: CtoHistoryDetails;
}

export interface CtoHistoryResult {
  rows: CtoHistoryRow[];
  totalEarned: number;
  totalUsed: number;
}

interface OvertimeCreditRow {
  id: string;
  date: string;
  hours: number | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
  attachment_url?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  employee?: CtoHistoryPerson | CtoHistoryPerson[] | null;
  approver?: CtoHistoryPerson | CtoHistoryPerson[] | null;
}

interface CtoLeaveUsageRow {
  id: string;
  start_date: string;
  end_date?: string | null;
  number_of_days: number | null;
  leave_duration_type?: string | null;
  reason?: string | null;
  attachment_url?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  employee?: CtoHistoryPerson | CtoHistoryPerson[] | null;
  approver?: CtoHistoryPerson | CtoHistoryPerson[] | null;
  filed_by_admin?: CtoHistoryPerson | CtoHistoryPerson[] | null;
}

/** Match Postgres ROUND(numeric, 3). 1 OT hour = 0.125 CTO. */
export function otHoursToCtoDays(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round((hours / OT_HOURS_PER_CTO_DAY) * 1000) / 1000;
}

function roundCto(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Three decimals so 0.125 / 1.000 display correctly. */
export function formatCtoFixed(value: number): string {
  return roundCto(value).toFixed(3);
}

export function formatOtHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function firstPerson(value?: CtoHistoryPerson | CtoHistoryPerson[] | null): CtoHistoryPerson | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function formatPersonName(person?: CtoHistoryPerson | CtoHistoryPerson[] | null): string {
  const p = firstPerson(person);
  if (!p) return '—';
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (!name) return p.employee_code ? String(p.employee_code) : '—';
  return p.employee_code ? `${name} (${p.employee_code})` : name;
}

function emptyDetails(): CtoHistoryDetails {
  return {
    filedBy: '—',
    filedAt: null,
    filedOnBehalf: false,
    approvedBy: '—',
    approvedAt: null,
    status: 'approved',
    reason: null,
    attachmentUrl: null,
    startTime: null,
    endTime: null,
    endDate: null,
    durationType: null,
  };
}

export async function fetchCtoHistory(employeeId: string, year: number): Promise<CtoHistoryResult> {
  const { start, end } = yearBounds(year);

  const [otRes, leaveRes] = await Promise.all([
    supabase
      .from('overtime_requests')
      .select(
        'id, date, hours, start_time, end_time, reason, attachment_url, status, created_at, approved_at, employee:employees!employee_id(first_name, last_name, employee_code), approver:employees!approved_by(first_name, last_name, employee_code)'
      )
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true }),
    supabase
      .from('leave_requests')
      .select(
        'id, start_date, end_date, number_of_days, leave_duration_type, reason, attachment_url, status, created_at, approved_at, employee:employees!employee_id(first_name, last_name, employee_code), approver:employees!approved_by(first_name, last_name, employee_code), filed_by_admin:employees!filed_by_admin_id(first_name, last_name, employee_code)'
      )
      .eq('employee_id', employeeId)
      .eq('leave_type', 'cto')
      .eq('status', 'approved')
      .gte('start_date', start)
      .lte('start_date', end)
      .order('start_date', { ascending: true }),
  ]);

  if (otRes.error) throw new Error(`Failed to fetch overtime credits: ${otRes.error.message}`);
  if (leaveRes.error) throw new Error(`Failed to fetch CTO usage: ${leaveRes.error.message}`);

  const pending: Array<Omit<CtoHistoryRow, 'runningTotal'>> = [];

  ((otRes.data as OvertimeCreditRow[]) || []).forEach((row) => {
    const hours = Number(row.hours ?? 0);
    const credited = otHoursToCtoDays(hours);
    if (credited <= 0) return;
    pending.push({
      id: `ot-${row.id}`,
      date: row.date,
      source: 'overtime',
      sourceLabel: 'Approved OT',
      otHours: hours,
      ctoDelta: credited,
      details: {
        ...emptyDetails(),
        filedBy: formatPersonName(row.employee),
        filedAt: row.created_at ?? null,
        filedOnBehalf: false,
        approvedBy: formatPersonName(row.approver),
        approvedAt: row.approved_at ?? null,
        status: row.status || 'approved',
        reason: row.reason ?? null,
        attachmentUrl: row.attachment_url ?? null,
        startTime: row.start_time ?? null,
        endTime: row.end_time ?? null,
      },
    });
  });

  ((leaveRes.data as CtoLeaveUsageRow[]) || []).forEach((row) => {
    const days = Number(row.number_of_days ?? 0);
    if (!Number.isFinite(days) || days <= 0) return;
    const adminFiler = firstPerson(row.filed_by_admin);
    pending.push({
      id: `leave-${row.id}`,
      date: row.start_date,
      source: 'leave',
      sourceLabel: 'Approved CTO leave',
      otHours: null,
      ctoDelta: -roundCto(days),
      details: {
        ...emptyDetails(),
        filedBy: adminFiler ? formatPersonName(adminFiler) : formatPersonName(row.employee),
        filedAt: row.created_at ?? null,
        filedOnBehalf: !!adminFiler,
        approvedBy: formatPersonName(row.approver),
        approvedAt: row.approved_at ?? null,
        status: row.status || 'approved',
        reason: row.reason ?? null,
        attachmentUrl: row.attachment_url ?? null,
        endDate: row.end_date ?? null,
        durationType: row.leave_duration_type ?? null,
      },
    });
  });

  pending.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.source !== b.source) return a.source === 'overtime' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  let running = 0;
  let totalEarned = 0;
  let totalUsed = 0;
  const rows: CtoHistoryRow[] = pending.map((row) => {
    running = roundCto(running + row.ctoDelta);
    if (row.ctoDelta > 0) totalEarned = roundCto(totalEarned + row.ctoDelta);
    else totalUsed = roundCto(totalUsed + Math.abs(row.ctoDelta));
    return { ...row, runningTotal: running };
  });

  return { rows, totalEarned, totalUsed };
}
