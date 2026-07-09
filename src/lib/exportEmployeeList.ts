/**
 * Employee List Export — PDF, XLSX
 * Layout matches Leave Report / Leave Balance Report (company header + yellow table headers).
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { drawCompanyPdfHeader, PDF_YELLOW_TABLE_HEAD_STYLES } from '@/lib/exportPdfReportLayout';
import { writeStyledXlsxReport, type CompanyProfileForExport } from '@/lib/exportXlsxReportLayout';

const REPORT_HEADERS = [
  'Employee Code',
  'Employee Name',
  'Company Email',
  'Department',
  'Position',
  'Role',
  'Employment Status',
  'Active',
] as const;

const COLUMN_WIDTHS = [12, 22, 24, 20, 18, 16, 18, 10];

export interface EmployeeListExportItem {
  employee_code: string;
  first_name: string;
  last_name: string;
  company_email: string | null;
  department: string;
  position: string | null;
  roles: string;
  employment_status: string;
  active_status: string;
}

export interface ExportEmployeeListOptions {
  employees: EmployeeListExportItem[];
  format: 'pdf' | 'xlsx';
  filenameSuffix?: string;
}

function employeeDisplayName(emp: EmployeeListExportItem): string {
  return [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '—';
}

function buildRows(employees: EmployeeListExportItem[]): string[][] {
  return employees.map((emp) => [
    emp.employee_code || '—',
    employeeDisplayName(emp),
    emp.company_email || '—',
    emp.department || '—',
    emp.position || '—',
    emp.roles || '—',
    emp.employment_status || '—',
    emp.active_status,
  ]);
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

export async function exportEmployeeList(options: ExportEmployeeListOptions): Promise<void> {
  const { employees, format, filenameSuffix } = options;
  const headers = [...REPORT_HEADERS];
  const rows = buildRows(employees);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const suffix = filenameSuffix ? `-${filenameSuffix}` : '';
  const filename = `employee-list${suffix}-${dateStamp}`;

  if (format === 'xlsx') {
    const profile = await fetchCompanyProfile();
    writeStyledXlsxReport({
      profile,
      reportTitle: 'Employee List',
      sheetName: 'Employee List',
      filename: `${filename}.xlsx`,
      headers,
      dataRows: rows,
      columnWidths: COLUMN_WIDTHS,
      emptyMessageCol: 1,
      titlePlacement: 'top-right',
    });
    return;
  }

  const profile = await fetchCompanyProfile();
  const doc = new jsPDF({ orientation: 'landscape' });
  const tableStartY = drawCompanyPdfHeader(doc, profile, 'Employee List');

  const body =
    rows.length === 0
      ? [Array(headers.length).fill('').map((_, i) => (i === 1 ? 'No Records' : ''))]
      : rows.map((row) => row.map((v) => String(v).slice(0, 80)));

  autoTable(doc, {
    startY: tableStartY,
    head: [headers],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    margin: { left: 14, right: 14 },
    headStyles: PDF_YELLOW_TABLE_HEAD_STYLES,
  });

  doc.save(`${filename}.pdf`);
}
