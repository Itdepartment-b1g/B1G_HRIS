import { useActivityComplianceContext } from '@/contexts/ActivityComplianceContext';

export type { ActivityCompliance } from '@/contexts/ActivityComplianceContext';

/**
 * Returns whether the current user can time out.
 * canTimeOut is false until all announcements and policies are acknowledged,
 * and all assigned surveys are completed.
 * Must be used within ActivityComplianceProvider (DashboardLayout).
 */
export function useActivityCompliance() {
  return useActivityComplianceContext();
}
