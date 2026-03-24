import { supabase } from '@/lib/supabase';

type RequestType = 'leave' | 'overtime' | 'business_trip';
type RequestEvent = 'submitted' | 'approved' | 'rejected';
type ActivityType = 'announcement' | 'policy' | 'survey';

export async function createRequestInAppNotification(input: {
  event: RequestEvent;
  requestType: RequestType;
  requestId: string;
  approverId?: string;
}) {
  const { error } = await supabase.rpc('create_request_notifications', {
    p_event: input.event,
    p_request_type: input.requestType,
    p_request_id: input.requestId,
    p_approver_id: input.approverId ?? null,
  });
  if (error) throw error;
}

export async function createActivityInAppNotification(input: {
  type: ActivityType;
  title: string;
  message: string;
  actionUrl: string;
  targetAudience: 'all' | 'selected';
  targetEmployeeIds: string[];
  metadata?: Record<string, unknown>;
  requiresAck?: boolean;
}) {
  const { error } = await supabase.rpc('create_activity_notifications', {
    p_type: input.type,
    p_title: input.title,
    p_message: input.message,
    p_action_url: input.actionUrl,
    p_target_audience: input.targetAudience,
    p_target_employee_ids: input.targetEmployeeIds,
    p_metadata: input.metadata ?? {},
    p_requires_ack: input.requiresAck ?? true,
  });
  if (error) throw error;
}
