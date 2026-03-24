import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type NotificationType =
  | 'leave'
  | 'business_trip'
  | 'overtime'
  | 'survey'
  | 'announcement'
  | 'policy';

export interface UserNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  requires_ack: boolean;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export function useNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data || []) as UserNotification[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const ackPending = useMemo(
    () => notifications.filter((n) => n.requires_ack && !n.is_acknowledged),
    [notifications]
  );

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifications((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: new Date().toISOString() }))
    );
  }, [userId]);

  const acknowledge = useCallback(async (id: string) => {
    await supabase
      .from('user_notifications')
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              is_acknowledged: true,
              acknowledged_at: new Date().toISOString(),
              is_read: true,
              read_at: new Date().toISOString(),
            }
          : n
      )
    );
  }, [userId]);

  return {
    notifications,
    loading,
    unreadCount,
    ackPending,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    acknowledge,
  };
}
