import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { LeaveBalance, LeaveTypeConfigForBalance } from '@/types';

const DEFAULT_TYPES: LeaveTypeConfigForBalance[] = [
  { code: 'vl', name: 'Vacation Leave', annual_entitlement: 15, cap: 30, is_system: true },
  { code: 'sl', name: 'Sick Leave', annual_entitlement: 15, cap: null, is_system: true },
  { code: 'pto', name: 'Personal Time Off', annual_entitlement: 7, cap: null, is_system: true },
  { code: 'lwop', name: 'Leave Without Pay', annual_entitlement: 0, cap: null, is_system: true },
];

function getBalanceForType(
  balance: LeaveBalance | null,
  cfg: LeaveTypeConfigForBalance
): number {
  if (!balance) return cfg.annual_entitlement ?? 0;
  if (cfg.code === 'lwop') return Number(balance.lwop_days_used ?? 0);
  if (cfg.code === 'vl') return Number(balance.vl_balance ?? 0);
  if (cfg.code === 'sl') return Number(balance.sl_balance ?? 0);
  if (cfg.code === 'pto') return Number(balance.pto_balance ?? 0);
  return Number(balance.balances?.[cfg.code] ?? cfg.annual_entitlement ?? 0);
}

const MyLeaveBalance = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [eligibleLeaveTypes, setEligibleLeaveTypes] = useState<LeaveTypeConfigForBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRegular, setIsRegular] = useState(true);

  const fetchData = useCallback(async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setLoading(true);
    const year = new Date().getFullYear();

    const { data: empData } = await supabase
      .from('employees')
      .select('employment_status_id, gender')
      .eq('id', currentUser.id)
      .single();
    const statusId = (empData as { employment_status_id?: string } | null)?.employment_status_id;
    const empGender = ((empData as { gender?: string } | null)?.gender || '').toLowerCase().trim();

    let isRegularEmp = true;
    if (statusId) {
      const { data: esData } = await supabase
        .from('employment_statuses')
        .select('is_regular')
        .eq('id', statusId)
        .single();
      isRegularEmp = (esData as { is_regular?: boolean } | null)?.is_regular ?? true;
      setIsRegular(isRegularEmp);
    }

    if (isRegularEmp) {
      await supabase.rpc('ensure_leave_balance_for_current_user');
    }

    const { data: lbData, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', currentUser.id)
      .eq('year', year)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch leave balance:', error);
      setBalance(null);
    } else if (lbData) {
      const lb = lbData as { balances?: Record<string, number> };
      setBalance({
        employee_id: lbData.employee_id,
        year: lbData.year,
        vl_balance: Number(lbData.vl_balance ?? 0),
        sl_balance: Number(lbData.sl_balance ?? 0),
        pto_balance: Number(lbData.pto_balance ?? 0),
        lwop_days_used: Number(lbData.lwop_days_used ?? 0),
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

    const configs = (configData || []) as LeaveTypeConfigForBalance[] & { id: string }[];
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
    setEligibleLeaveTypes(eligible.length > 0 ? eligible : DEFAULT_TYPES);
    if (!silent) setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('my-leave-balance-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_balances', filter: `employee_id=eq.${currentUser.id}` },
        () => fetchData(true)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_type_config' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_type_eligibility' }, () => fetchData(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchData]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Leave balance updated');
  };

  if (!currentUser) return null;

  const typesToShow = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : DEFAULT_TYPES;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/leave')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">My Leave Balance</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date().getFullYear()} — View your available leave credits
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Balance ({new Date().getFullYear()})</CardTitle>
          <CardDescription>
            {isRegular
              ? 'Your available leave credits. File leave from the Leave Management page.'
              : 'As a non-regular employee, you can file LWOP only.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !isRegular ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">LWOP Used</p>
                <p className="text-2xl font-bold">{balance?.lwop_days_used ?? 0}</p>
                <p className="text-xs text-muted-foreground">Leave Without Pay (unlimited)</p>
              </div>
            </div>
          ) : !balance && !loading ? (
            <p className="text-sm text-muted-foreground py-4">
              No leave balance record yet. Balances are created for regular employees. Contact HR if you need assistance.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {typesToShow.map((cfg) => {
                const isLwop = cfg.code === 'lwop';
                const bal = getBalanceForType(balance, cfg);
                const maxVal = cfg.cap ?? cfg.annual_entitlement;
                const label = ['vl', 'sl', 'pto', 'lwop'].includes(cfg.code)
                  ? cfg.code.toUpperCase()
                  : cfg.name;
                return (
                  <div key={cfg.code} className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">
                      {label} {!isLwop && maxVal != null ? `(of ${maxVal})` : ''}
                    </p>
                    <p className="text-2xl font-bold">{bal}</p>
                    <p className="text-xs text-muted-foreground">
                      {isLwop ? 'Leave Without Pay (unlimited)' : `${cfg.name} remaining`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyLeaveBalance;
