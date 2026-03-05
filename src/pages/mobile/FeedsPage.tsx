import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

const FeedsPage = () => {
  const [leaveRequests, setLeaveRequests] = useState<Array<{ id: string; employee_name: string; start_date: string; leave_type: string; status: string }>>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; author: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [leaveRes, annRes] = await Promise.all([
        supabase.from('leave_requests').select('id, start_date, leave_type, status, employee:employees!employee_id(first_name, last_name)').order('created_at', { ascending: false }).limit(20),
        supabase.from('announcements').select('id, title, content, created_at, author:employees!author_id(first_name, last_name)').order('created_at', { ascending: false }).limit(10),
      ]);
      setLeaveRequests((leaveRes.data || []).map((l: any) => ({
        id: l.id,
        employee_name: l.employee ? `${l.employee.first_name} ${l.employee.last_name}` : 'Unknown',
        start_date: l.start_date,
        leave_type: l.leave_type,
        status: l.status,
      })));
      setAnnouncements((annRes.data || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
        created_at: a.created_at,
      })));
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Feeds</h1>
        <p className="text-gray-600 text-sm mt-1">Recent activity and updates</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-4">Loading...</p>
      ) : (
        <div className="space-y-3">
          {leaveRequests.map((leave) => (
            <Card key={leave.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {leave.employee_name.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-black">{leave.employee_name}</p>
                      <p className="text-xs text-gray-500">{leave.start_date}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      leave.status === 'approved'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : leave.status === 'pending'
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-red-100 text-red-700 border-red-300'
                    }
                  >
                    {leave.status === 'approved' ? 'Approved' : leave.status === 'pending' ? 'Pending' : 'Rejected'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-gray-700 capitalize">{leave.leave_type} Leave Request</p>
              </CardContent>
            </Card>
          ))}

          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {a.author.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-black">{a.title}</p>
                    <p className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-600">{a.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeedsPage;
