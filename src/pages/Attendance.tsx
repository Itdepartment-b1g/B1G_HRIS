import { attendanceRecords } from '@/data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const Attendance = () => {
  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: 'bg-success/10 text-success border-success/20',
      late: 'bg-warning/10 text-warning border-warning/20',
      absent: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return <Badge variant="outline" className={styles[status] || ''}>{status}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance Records</h1>
        <p className="text-muted-foreground text-sm mt-1">View daily attendance with geolocation data</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today — {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</CardTitle>
        </CardHeader>
        <CardContent>
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
              {attendanceRecords.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell className="font-mono text-sm">{r.time_in || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{r.time_out || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.lat_in ? `${r.lat_in.toFixed(4)}, ${r.lng_in?.toFixed(4)}` : '—'}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Attendance;
