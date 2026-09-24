import { createServiceClient } from '../../../lib/supabase.js';
import type { HandoffDepartment, HandoffEmployee } from '../../../lib/asset-handoff.js';

type DepartmentJoin = { id: string; name: string } | { id: string; name: string }[] | null;

/**
 * SELECT d.id, d.name
 * FROM employee_departments ed
 * JOIN departments d ON d.id = ed.department_id
 * WHERE ed.employee_id = :employeeId
 */
function mapHandoffDepartments(rows: Array<{ departments: DepartmentJoin }> | null): HandoffDepartment[] {
  const departments: HandoffDepartment[] = [];
  const seen = new Set<string>();

  for (const row of rows ?? []) {
    const joined = row.departments;
    const list = Array.isArray(joined) ? joined : joined ? [joined] : [];
    for (const dept of list) {
      const name = dept.name?.trim();
      if (!dept.id || !name || seen.has(dept.id)) continue;
      seen.add(dept.id);
      departments.push({ id: dept.id, name });
    }
  }

  return departments;
}

/**
 * Load employee fields needed for Asset Management SSO handoff.
 */
export async function getEmployeeForHandoff(employeeId: string): Promise<HandoffEmployee | null> {
  const supabase = createServiceClient();
  const [employeeResult, deptResult] = await Promise.all([
    supabase
      .from('employees')
      .select('id, employee_code, company_email, first_name, middle_name, last_name, is_active')
      .eq('id', employeeId)
      .maybeSingle(),
    supabase
      .from('employee_departments')
      .select('departments!inner(id, name)')
      .eq('employee_id', employeeId),
  ]);

  if (employeeResult.error) {
    throw new Error(`Failed to load employee: ${employeeResult.error.message}`);
  }

  if (deptResult.error) {
    throw new Error(`Failed to load employee departments: ${deptResult.error.message}`);
  }

  const data = employeeResult.data;
  if (!data) return null;

  return {
    id: data.id,
    employee_code: data.employee_code,
    company_email: data.company_email ?? null,
    first_name: data.first_name,
    middle_name: data.middle_name ?? null,
    last_name: data.last_name,
    is_active: data.is_active !== false,
    departments: mapHandoffDepartments(deptResult.data as Array<{ departments: DepartmentJoin }> | null),
  };
}
