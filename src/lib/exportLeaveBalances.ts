/**
 * Leave Balances Export — PDF, CSV, XLSX
 * Exports all employees and their leave balances (dynamic columns from leave_type_config).
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

function getDisplayValue(lb: LeaveBalanceForExport | null, code: string): string {
  if (!lb) return '---';
  if (code === 'lwop') return lb.lwop_days_used != null ? String(lb.lwop_days_used) : '---';
  if (code === 'vl') return lb.vl_balance != null ? String(lb.vl_balance) : '---';
  if (code === 'sl') return lb.sl_balance != null ? String(lb.sl_balance) : '---';
  if (code === 'pto') return lb.pto_balance != null ? String(lb.pto_balance) : '---';
  const v = lb.balances?.[code];
  return v != null ? String(v) : '---';
}

function employeeName(e: EmployeeForExport): string {
  return [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
}

export interface ExportLeaveBalancesOptions {
  employees: EmployeeForExport[];
  balanceMap: Map<string, LeaveBalanceForExport>;
  leaveTypeConfigs: LeaveTypeConfigForExport[];
  year: number;
  format: 'pdf' | 'csv' | 'xlsx';
}

function escapeCsvField(val: string): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportLeaveBalances(options: ExportLeaveBalancesOptions): void {
  const { employees, balanceMap, leaveTypeConfigs, year, format } = options;

  const headers = ['Employee Code', 'Employee Name', ...leaveTypeConfigs.map((c) => c.name)];

  const rows = employees.map((e) => {
    const lb = balanceMap.get(e.id) ?? null;
    return [
      e.employee_code || '—',
      employeeName(e),
      ...leaveTypeConfigs.map((c) => getDisplayValue(lb, c.code)),
    ];
  });

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
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Balances');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Leave Balances — Year ${year}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`${rows.length} employee${rows.length !== 1 ? 's' : ''}`, 14, 28);

    const head = [headers];
    const body = rows.map((r) => r.map((v) => String(v).slice(0, 30)));

    autoTable(doc, {
      startY: 36,
      head,
      body,
      styles: { fontSize: 8 },
      margin: { left: 14 },
    });

    doc.save(`${filename}.pdf`);
  }
}
