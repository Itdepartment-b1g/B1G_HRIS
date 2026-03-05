import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';

const TeammatesPage = () => {
  const { user: currentUser } = useCurrentUser();
  const [employeesWithRole, setEmployeesWithRole] = useState<Array<Employee & { role: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [empRes, roleRes] = await Promise.all([
        supabase.from('employees').select('*').eq('is_active', true).order('first_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      const roleMap = new Map<string, string>();
      (roleRes.data || []).forEach((r: { user_id: string; role: string }) => roleMap.set(r.user_id, r.role));
      const merged = (empRes.data || []).map((e) => ({ ...e, role: roleMap.get(e.id) || 'employee' }));
      setEmployeesWithRole(merged as Array<Employee & { role: string }>);
      setLoading(false);
    };
    fetchData();
  }, []);

  const supervisor = currentUser?.supervisor_id
    ? employeesWithRole.find((e) => e.id === currentUser.supervisor_id)
    : employeesWithRole.find((e) => e.role === 'supervisor' || e.role === 'admin');
  const coworkers = employeesWithRole.filter(
    (e) => e.role === 'employee' && e.supervisor_id === currentUser?.supervisor_id && e.id !== currentUser?.id
  );

  if (!currentUser) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Today's Teammate</h1>
        <p className="text-gray-600 text-sm mt-1">Give a task to your team by clicking their profile</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-6">
          {loading ? (
            <p className="text-sm text-gray-500 py-4">Loading...</p>
          ) : (
            <>
              {supervisor && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Supervisor</p>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <Avatar className="h-14 w-14 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {supervisor.first_name[0]}
                        {supervisor.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-black">
                        {supervisor.first_name} {supervisor.last_name}
                      </p>
                      <p className="text-xs text-gray-600">{supervisor.position || '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Your Co-Workers</p>
                <div className="flex flex-wrap gap-3">
                  {coworkers.length === 0 ? (
                    <p className="text-sm text-gray-500">No co-workers in your team</p>
                  ) : (
                    coworkers.map((cw) => (
                      <div
                        key={cw.id}
                        className="flex flex-col items-center p-3 rounded-lg bg-gray-50 min-w-[80px]"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-medium">
                            {cw.first_name[0]}
                            {cw.last_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-xs font-medium text-black mt-2 text-center truncate w-full">
                          {cw.first_name}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeammatesPage;
