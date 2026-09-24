import { supabase } from '@/lib/supabase';

const UNIQUE_VIOLATION = '23505';

async function markMatchingNotificationAcked(
  userId: string,
  type: 'announcement' | 'policy',
  entityId: string
): Promise<void> {
  const key = type === 'announcement' ? 'announcement_id' : 'policy_id';
  const now = new Date().toISOString();
  await supabase
    .from('user_notifications')
    .update({
      is_acknowledged: true,
      acknowledged_at: now,
      is_read: true,
      read_at: now,
    })
    .eq('user_id', userId)
    .eq('type', type)
    .eq('is_acknowledged', false)
    .filter(`metadata->>${key}`, 'eq', entityId);
}

export async function acknowledgeAnnouncement(employeeId: string, announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('announcement_acknowledgements')
    .insert({ announcement_id: announcementId, employee_id: employeeId });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
  await markMatchingNotificationAcked(employeeId, 'announcement', announcementId);
}

export async function acknowledgePolicy(employeeId: string, policyId: string): Promise<void> {
  const { error } = await supabase
    .from('policy_acknowledgements')
    .insert({ policy_id: policyId, employee_id: employeeId });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
  await markMatchingNotificationAcked(employeeId, 'policy', policyId);
}
