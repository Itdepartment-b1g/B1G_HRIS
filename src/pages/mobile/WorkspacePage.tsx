import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FileText, Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';

const WorkspacePage = () => {
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
        <h1 className="text-2xl font-bold text-black">Workspace</h1>
        <p className="text-gray-600 text-sm mt-1">Polling, survey, today's task & birthdays</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Employee Survey</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="polling" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="polling">Polling</TabsTrigger>
              <TabsTrigger value="survey">Survey</TabsTrigger>
            </TabsList>
            <TabsContent value="polling" className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-20 w-20 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-black">No records to display</p>
                <p className="text-xs text-gray-500 mt-1">Polling responses will appear here</p>
              </div>
            </TabsContent>
            <TabsContent value="survey" className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-20 w-20 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-black">No records to display</p>
                <p className="text-xs text-gray-500 mt-1">Survey responses will appear here</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today's Task</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col items-center justify-center text-center py-6">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-lg font-medium text-black">Hooray! All tasks are caught up</p>
            <p className="text-sm text-gray-600 mt-1">Break a leg, stay productive!</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Employees Birthday</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-gray-500 py-4">Loading...</p>
            ) : employees.length > 0 ? (
              employees.slice(0, 5).map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {emp.first_name[0]}
                      {emp.last_name[0]}
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
              <div className="flex flex-col items-center justify-center py-10 text-center">
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

export default WorkspacePage;
