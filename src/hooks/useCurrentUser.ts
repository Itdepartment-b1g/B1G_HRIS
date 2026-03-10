import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';
import type { UserRole } from '@/lib/edgeFunctions';

const ROLE_HIERARCHY: UserRole[] = ['super_admin', 'admin', 'executive', 'manager', 'supervisor', 'employee', 'intern'];

export interface CurrentUser extends Employee {
  role: UserRole; // primary (highest) role for backward compat
  roles: UserRole[]; // all roles
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
      supabase.from('user_roles').select('role').eq('user_id', session.user.id),
    ]);
    if (empRes.error) {
      setError(empRes.error.message);
      setUser(null);
    } else if (empRes.data) {
      const roles = (roleRes.data || []).map((r) => r.role as UserRole);
      const roleList = roles.length > 0 ? roles : ['employee'];
      const primary = ROLE_HIERARCHY.find((r) => roleList.includes(r)) ?? 'employee';
      setUser({ ...empRes.data, role: primary, roles: roleList } as CurrentUser);
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
