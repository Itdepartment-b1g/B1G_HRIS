import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarFallback } from '@/lib/utils';
import { Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';

// Schema has no birth_date; show employees as "team" or add birth_date to schema later
const BirthdaysPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('employees').select('*').eq('is_active', true).order('first_name').limit(20);
      setEmployees(data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Employees Birthday</h1>
        <p className="text-gray-600 text-sm mt-1">Celebrating birthdays this month</p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-gray-500 py-4">Loading...</p>
            ) : employees.length > 0 ? (
              employees.slice(0, 10).map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={emp.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getAvatarFallback(emp.first_name, emp.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-black">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-xs text-gray-500">{emp.department || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1 text-amber-600">
                    <Cake className="h-4 w-4" />
                    <span className="text-xs font-medium">Team</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Cake className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm text-gray-600">No employees to display</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BirthdaysPage;
