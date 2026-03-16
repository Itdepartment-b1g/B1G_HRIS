import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ActivityCompliance {
  canTimeOut: boolean;
  pending: {
    announcements: number;
    policies: number;
    surveys: number;
  };
  loading: boolean;
  refetch: () => Promise<void>;
}

const ActivityComplianceContext = createContext<ActivityCompliance | null>(null);

export function ActivityComplianceProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: React.ReactNode;
}) {
  const [canTimeOut, setCanTimeOut] = useState(true);
  const [pending, setPending] = useState({ announcements: 0, policies: 0, surveys: 0 });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setCanTimeOut(true);
      setPending({ announcements: 0, policies: 0, surveys: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_activity_compliance', { _user_id: userId });
    if (error) {
      console.warn('Activity compliance check failed:', error.message);
      setCanTimeOut(true);
      setPending({ announcements: 0, policies: 0, surveys: 0 });
    } else if (data) {
      const result = data as { can_time_out?: boolean; announcements?: number; policies?: number; surveys?: number };
      setCanTimeOut(result.can_time_out ?? true);
      setPending({
        announcements: result.announcements ?? 0,
        policies: result.policies ?? 0,
        surveys: result.surveys ?? 0,
      });
    } else {
      setCanTimeOut(true);
      setPending({ announcements: 0, policies: 0, surveys: 0 });
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: refetch compliance when user acknowledges or completes survey
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('activity-compliance')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'announcement_acknowledgements',
          filter: `employee_id=eq.${userId}`,
        },
        () => refetch()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'policy_acknowledgements',
          filter: `employee_id=eq.${userId}`,
        },
        () => refetch()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'survey_responses',
          filter: `employee_id=eq.${userId}`,
        },
        () => refetch()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'survey_completions',
          filter: `employee_id=eq.${userId}`,
        },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  const value: ActivityCompliance = {
    canTimeOut,
    pending,
    loading,
    refetch,
  };

  return (
    <ActivityComplianceContext.Provider value={value}>
      {children}
    </ActivityComplianceContext.Provider>
  );
}

export function useActivityComplianceContext(): ActivityCompliance {
  const ctx = useContext(ActivityComplianceContext);
  if (!ctx) {
    throw new Error('useActivityComplianceContext must be used within ActivityComplianceProvider');
  }
  return ctx;
}
