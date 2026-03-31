import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeaveBalance, LeaveTypeConfigForBalance } from '@/types';

interface UseEmployeeLeaveBalanceResult {
  balance: LeaveBalance | null;
  eligibleLeaveTypes: LeaveTypeConfigForBalance[];
  isRegular: boolean;
  loading: boolean;
  refresh: () => void;
}

export function useEmployeeLeaveBalance(employeeId: string | null | undefined): UseEmployeeLeaveBalanceResult {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [eligibleLeaveTypes, setEligibleLeaveTypes] = useState<LeaveTypeConfigForBalance[]>([]);
  const [isRegular, setIsRegular] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!employeeId) {
      setBalance(null);
      setEligibleLeaveTypes([]);
      setIsRegular(true);
      return;
    }
    setLoading(true);
    const year = new Date().getFullYear();

    const { data: empData } = await supabase
      .from('employees')
      .select('employment_status_id, gender')
      .eq('id', employeeId)
      .maybeSingle();

    const statusId = (empData as { employment_status_id?: string } | null)?.employment_status_id;
    const empGender = ((empData as { gender?: string } | null)?.gender || '').toLowerCase().trim();
    let isRegularEmp = true;

    if (statusId) {
      const { data: esData } = await supabase
        .from('employment_statuses')
        .select('is_regular')
        .eq('id', statusId)
        .maybeSingle();
      isRegularEmp = (esData as { is_regular?: boolean } | null)?.is_regular ?? true;
      setIsRegular(isRegularEmp);
    } else {
      setIsRegular(true);
    }

    if (isRegularEmp) {
      await supabase.rpc('ensure_leave_balance_for_current_user');
    }

    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .maybeSingle();

    if (error) {
      // Fallback: no balance found or RLS issue
      setBalance(null);
    } else if (data) {
      const lb = data as { balances?: Record<string, number> };
      setBalance({
        employee_id: data.employee_id,
        year: data.year,
        vl_balance: Number(data.vl_balance ?? 0),
        sl_balance: Number(data.sl_balance ?? 0),
        pto_balance: Number(data.pto_balance ?? 0),
        lwop_days_used: Number(data.lwop_days_used ?? 0),
        balances: lb.balances && typeof lb.balances === 'object' ? lb.balances : undefined,
      });
    } else {
      setBalance(null);
    }

    const { data: configData } = await supabase
      .from('leave_type_config')
      .select('id, code, name, annual_entitlement, cap, is_system')
      .order('sort_order');
    const { data: eligData } = await supabase
      .from('leave_type_eligibility')
      .select('leave_type_config_id, employment_status_id, gender_filter');

    let effectiveStatusId = statusId;
    if (!effectiveStatusId) {
      const { data: regStatus } = await supabase
        .from('employment_statuses')
        .select('id')
        .ilike('name', 'regular')
        .limit(1)
        .maybeSingle();
      effectiveStatusId = (regStatus as { id?: string } | null)?.id;
    }

    const configs = (configData || []) as {
      id: string;
      code: string;
      name: string;
      annual_entitlement: number;
      cap: number | null;
      is_system: boolean;
    }[];

    const eligibleRows = (eligData || []).filter(
      (e: { employment_status_id: string }) => e.employment_status_id === effectiveStatusId
    );

    const eligible = configs.filter((c) => {
      const match = eligibleRows.find((e: { leave_type_config_id: string }) => e.leave_type_config_id === c.id);
      if (!match) return c.code === 'lwop';
      const gf = (match as { gender_filter: string }).gender_filter;
      if (gf === 'all') return true;
      if (gf === 'male') return empGender === 'male' || empGender === 'm';
      if (gf === 'female') return empGender === 'female' || empGender === 'f';
      return false;
    });

    setEligibleLeaveTypes(eligible);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    eligibleLeaveTypes,
    isRegular,
    loading,
    refresh: fetchBalance,
  };
}

