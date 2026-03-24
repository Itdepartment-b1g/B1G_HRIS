import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Info } from 'lucide-react';
import type { LeaveBalance } from '@/types';

const EmployeeRequests = () => {
  const { user, loading: userLoading } = useCurrentUser();
  const [employmentStatus, setEmploymentStatus] = useState<{ name: string; is_regular: boolean } | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [lwopOnly, setLwopOnly] = useState<number | null>(null);

  const isRegular = employmentStatus === null ? true : employmentStatus.is_regular;

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const year = new Date().getFullYear();

    const { data: empData } = await supabase
      .from('employees')
      .select('employment_status_id')
      .eq('id', user.id)
      .single();

    const statusId = (empData as any)?.employment_status_id;
    let statusResolved: { name: string; is_regular: boolean } | null = null;
    if (statusId) {
      const { data: esData } = await supabase
        .from('employment_statuses')
        .select('name, is_regular')
        .eq('id', statusId)
        .single();
      if (esData) {
        statusResolved = {
          name: (esData as any).name,
          is_regular: (esData as any).is_regular ?? true,
        };
      }
    }
    setEmploymentStatus(statusResolved);

    const effectiveRegular = statusResolved === null ? true : statusResolved.is_regular;

    if (effectiveRegular) {
      const { data: ensureData } = await supabase.rpc('ensure_leave_balance_for_current_user');
      const rows = (ensureData || []) as Array<{
        employee_id: string;
        year: number;
        vl_balance: number;
        sl_balance: number;
        pto_balance: number;
        lwop_days_used: number;
      }>;
      if (rows.length > 0) {
        const r = rows[0];
        setBalance({
          employee_id: r.employee_id,
          year: r.year,
          vl_balance: Number(r.vl_balance ?? 0),
          sl_balance: Number(r.sl_balance ?? 0),
          pto_balance: Number(r.pto_balance ?? 0),
          lwop_days_used: Number(r.lwop_days_used ?? 0),
        });
      } else {
        setBalance(null);
      }
      setLwopOnly(null);
    } else {
      const { data: lbData } = await supabase
        .from('leave_balances')
        .select('lwop_days_used')
        .eq('employee_id', user.id)
        .eq('year', year)
        .maybeSingle();
      setLwopOnly(lbData ? Number(lbData.lwop_days_used ?? 0) : 0);
      setBalance(null);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (userLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusName = employmentStatus?.name ?? 'Regular';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-7 w-7" />
          Employee Requests
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          View your leave balances and submit leave, overtime, and time-off requests
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Balances ({new Date().getFullYear()})</CardTitle>
          <CardDescription>
            {isRegular
              ? 'Annual entitlement: VL 15 days, SL 15 days, PTO 7 days. LWOP is unlimited.'
              : `As a ${statusName} employee, you can only use Leave Without Pay (LWOP). VL, SL, and PTO are available once you become Regular.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isRegular ? (
            balance ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">VL (of 15)</p>
                  <p className="text-2xl font-bold">{balance.vl_balance}</p>
                  <p className="text-xs text-muted-foreground">Vacation Leave remaining</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">SL (of 15)</p>
                  <p className="text-2xl font-bold">{balance.sl_balance}</p>
                  <p className="text-xs text-muted-foreground">Sick Leave remaining</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">PTO (of 7)</p>
                  <p className="text-2xl font-bold">{balance.pto_balance}</p>
                  <p className="text-xs text-muted-foreground">Personal Time Off remaining</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">LWOP Used</p>
                  <p className="text-2xl font-bold">{balance.lwop_days_used}</p>
                  <p className="text-xs text-muted-foreground">Leave Without Pay (unlimited)</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                <Info className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  No leave balance record yet. Contact HR if you believe you should have leave credits.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
                <Info className="h-5 w-5 text-blue-600 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  As a {statusName} employee, you can only use Leave Without Pay (LWOP). VL, SL, and PTO are available
                  once you become Regular (typically after 6 months).
                </p>
              </div>
              <div className="rounded-lg border p-4 max-w-xs">
                <p className="text-sm text-muted-foreground">LWOP Days Used</p>
                <p className="text-2xl font-bold">{lwopOnly ?? 0}</p>
                <p className="text-xs text-muted-foreground">Leave Without Pay (unlimited)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Request</CardTitle>
          <CardDescription>Submit and track your leave requests. This feature is coming soon.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            You can file leave requests from the main Leave page. This section will be expanded with additional
            request types (overtime, time-off) in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeRequests;
