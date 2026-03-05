import { useState, useEffect } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RecordRow {
  id: string;
  employee_name: string;
  time_in: string | null;
  time_out: string | null;
  lat_in: number | null;
  lng_in: number | null;
  status: string;
}

const Attendance = () => {
  const { user } = useCurrentUser();
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('id, time_in, time_out, lat_in, lng_in, status, employee:employees!employee_id(first_name, last_name)')
        .order('date', { ascending: false })
        .limit(100);
      const rows = (data || []).map((r: any) => ({
        id: r.id,
        employee_name: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown',
        time_in: r.time_in ? new Date(r.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
        time_out: r.time_out ? new Date(r.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
        lat_in: r.lat_in,
        lng_in: r.lng_in,
        status: r.status,
      }));
      setRecords(rows);
      setLoading(false);
    };
    fetch();
  }, []);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: 'bg-success/10 text-success border-success/20',
      late: 'bg-warning/10 text-warning border-warning/20',
      absent: 'bg-destructive/10 text-destructive border-destructive/20',
      half_day: 'bg-blue-100 text-blue-700 border-blue-200',
      on_leave: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return <Badge variant="outline" className={styles[status] || ''}>{status}</Badge>;
  };

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance Records</h1>
        <p className="text-muted-foreground text-sm mt-1">View daily attendance with geolocation data</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today — {today}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Time Out</TableHead>
                  <TableHead>Location (In)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No attendance records</TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell className="font-mono text-sm">{r.time_in || '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{r.time_out || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lat_in != null ? `${r.lat_in.toFixed(4)}, ${r.lng_in?.toFixed(4)}` : '—'}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Attendance;
