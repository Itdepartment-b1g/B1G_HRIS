import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';
import type { UserRole } from '@/lib/edgeFunctions';

export interface CurrentUser extends Employee {
  role: UserRole;
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean; error: string | null; refetch: () => Promise<void> } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setUser(null);
      setLoading(false);
      return;
    }
    const [empRes, roleRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', session.user.id).limit(1),
    ]);
    if (empRes.error) {
      setError(empRes.error.message);
      setUser(null);
    } else if (empRes.data) {
      const role = (roleRes.data?.[0]?.role as UserRole) || 'employee';
      setUser({ ...empRes.data, role } as CurrentUser);
      setError(null);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }
      refetch();
    });

    refetch();
    return () => subscription.unsubscribe();
  }, [refetch]);

  return { user, loading, error, refetch };
}
