/**
 * Leave Balances Export — PDF, CSV, XLSX
 * Exports all employees and their leave balances (dynamic columns from leave_type_config).
 * Includes approved leave usage per type (summed from leave_requests).
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { drawCompanyPdfHeader, PDF_YELLOW_TABLE_HEAD_STYLES } from '@/lib/exportPdfReportLayout';
import { writeStyledXlsxReport, type CompanyProfileForExport } from '@/lib/exportXlsxReportLayout';
import {
  fetchApprovedLeaveUsageByYear,
  formatUsedDays,
  getUsedDays,
  type LeaveUsageMap,
} from '@/lib/leaveUsageAggregation';

export interface LeaveTypeConfigForExport {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

export interface LeaveBalanceForExport {
  employee_id: string;
  vl_balance: number | null;
  sl_balance: number | null;
  pto_balance: number | null;
  lwop_days_used: number | null;
  balances?: Record<string, number> | null;
}

export interface EmployeeForExport {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

function getBalanceDisplayValue(lb: LeaveBalanceForExport | null, code: string): string {
  if (!lb) return '---';
  if (code === 'lwop') return '---';
  if (code === 'vl') return lb.vl_balance != null ? String(lb.vl_balance) : '---';
  if (code === 'sl') return lb.sl_balance != null ? String(lb.sl_balance) : '---';
  if (code === 'pto') return lb.pto_balance != null ? String(lb.pto_balance) : '---';
  const v = lb.balances?.[code];
  return v != null ? String(v) : '---';
}

function employeeName(e: EmployeeForExport): string {
  return [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
}

function buildBalanceHeaders(leaveTypeConfigs: LeaveTypeConfigForExport[]): string[] {
  const headers = ['Employee Code', 'Employee Name'];
  leaveTypeConfigs.forEach((c) => {
    headers.push(`${c.name} (Balance)`, `${c.name} (Used)`);
  });
  return headers;
}

function buildBalanceRows(
  employees: EmployeeForExport[],
  balanceMap: Map<string, LeaveBalanceForExport>,
  leaveTypeConfigs: LeaveTypeConfigForExport[],
  usageMap: LeaveUsageMap
): string[][] {
  return employees.map((e) => {
    const lb = balanceMap.get(e.id) ?? null;
    const row: string[] = [e.employee_code || '—', employeeName(e)];
    leaveTypeConfigs.forEach((c) => {
      row.push(getBalanceDisplayValue(lb, c.code));
      row.push(formatUsedDays(getUsedDays(usageMap, e.id, c.code)));
    });
    return row;
  });
}

export interface ExportLeaveBalancesOptions {
  employees: EmployeeForExport[];
  balanceMap: Map<string, LeaveBalanceForExport>;
  leaveTypeConfigs: LeaveTypeConfigForExport[];
  year: number;
  format: 'pdf' | 'csv' | 'xlsx';
  usageMap?: LeaveUsageMap;
}

function escapeCsvField(val: string): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchCompanyProfile(): Promise<CompanyProfileForExport> {
  const { data, error } = await supabase
    .from('company_profile')
    .select('name, address, phone, mobile_number')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch company profile: ${error.message}`);
  return data || { name: 'B1G Corporation' };
}

export async function exportLeaveBalances(options: ExportLeaveBalancesOptions): Promise<void> {
  const { employees, balanceMap, leaveTypeConfigs, year, format } = options;

  const usageMap =
    options.usageMap ??
    (await fetchApprovedLeaveUsageByYear(
      year,
      employees.map((e) => e.id)
    ));

  const headers = buildBalanceHeaders(leaveTypeConfigs);
  const rows = buildBalanceRows(employees, balanceMap, leaveTypeConfigs, usageMap);

  const filename = `leave-balances-${year}`;

  if (format === 'csv') {
    const lines = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.map(escapeCsvField).join(',')),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'xlsx') {
    const profile = await fetchCompanyProfile();
    const columnWidths = [14, 24, ...leaveTypeConfigs.flatMap(() => [12, 10])];

    writeStyledXlsxReport({
      profile,
      reportTitle: 'Leave Balance Report',
      sheetName: 'Leave Balances',
      filename: `${filename}.xlsx`,
      headers,
      dataRows: rows,
      columnWidths,
      emptyMessageCol: 1,
      titlePlacement: 'centered',
    });
  } else {
    const profile = await fetchCompanyProfile();
    const doc = new jsPDF({ orientation: 'landscape' });
    const tableStartY = drawCompanyPdfHeader(doc, profile, 'Leave Balance Report');

    autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body: rows.map((r) => r.map((v) => String(v).slice(0, 30))),
      styles: { fontSize: 7, cellPadding: 2 },
      margin: { left: 14, right: 14 },
      headStyles: PDF_YELLOW_TABLE_HEAD_STYLES,
    });

    doc.save(`${filename}.pdf`);
  }
}
