import { createServiceClient } from '../../../lib/supabase.js';
import type { HandoffEmployee } from '../../../lib/asset-handoff.js';

/**
 * Load employee fields needed for Asset Management SSO handoff.
 */
export async function getEmployeeForHandoff(employeeId: string): Promise<HandoffEmployee | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('employees')
    .select('id, employee_code, company_email, first_name, middle_name, last_name, is_active')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load employee: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    employee_code: data.employee_code,
    company_email: data.company_email ?? null,
    first_name: data.first_name,
    middle_name: data.middle_name ?? null,
    last_name: data.last_name,
    is_active: data.is_active !== false,
  };
}
