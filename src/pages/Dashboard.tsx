import { useState, useEffect, useCallback } from 'react';
import { MapPin, ChevronDown, Clock, FileText, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import type { AttendanceRecord } from '@/types';
import type { Employee } from '@/types';
import { toast } from 'sonner';

const statusVariant: Record<AttendanceRecord['status'], string> = {
  present: 'bg-green-100 text-green-700 border-green-200',
  late: 'bg-amber-100 text-amber-700 border-amber-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  half_day: 'bg-blue-100 text-blue-700 border-blue-200',
  on_leave: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatTime(t: string | null): string {
  if (!t) return '--:--';
  const d = new Date(t);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const Dashboard = () => {
  const { user: currentUser } = useCurrentUser();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [attendanceLogOpen, setAttendanceLogOpen] = useState(false);

  const [attendanceLog, setAttendanceLog] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Array<{ id: string; employee_id: string; employee_name: string; leave_type: string; start_date: string; end_date: string; status: string; reason?: string | null }>>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; author: string; created_at: string }>>([]);
  const [employeesWithRole, setEmployeesWithRole] = useState<Array<Employee & { role: string }>>([]);
  const [companyProfile, setCompanyProfile] = useState<{ name: string; address?: string; work_start_time?: string; work_end_time?: string } | null>(null);

  const fetchAttendanceLog = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', currentUser.id)
      .order('date', { ascending: false })
      .limit(30);
    const withName = (data || []).map((r) => ({
      ...r,
      date: r.date,
      employee_name: `${currentUser.first_name} ${currentUser.last_name}`,
      time_in: r.time_in ? formatTime(r.time_in) : null,
      time_out: r.time_out ? formatTime(r.time_out) : null,
    }));
    setAttendanceLog(withName as AttendanceRecord[]);
  }, [currentUser?.id, currentUser?.first_name, currentUser?.last_name]);

  const fetchLeaveAndAnnouncements = useCallback(async () => {
    const [leaveRes, annRes] = await Promise.all([
      supabase.from('leave_requests').select('*, employee:employees!employee_id(first_name, last_name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('announcements').select('*, author:employees!author_id(first_name, last_name)').order('created_at', { ascending: false }).limit(10),
    ]);
    setLeaveRequests((leaveRes.data || []).map((l: any) => ({
      id: l.id,
      employee_id: l.employee_id,
      employee_name: l.employee ? `${l.employee.first_name} ${l.employee.last_name}` : 'Unknown',
      leave_type: l.leave_type,
      start_date: l.start_date,
      end_date: l.end_date,
      status: l.status,
      reason: l.reason,
    })));
    setAnnouncements((annRes.data || []).map((a: any) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
      created_at: a.created_at,
    })));
  }, []);

  const fetchEmployeesAndCompany = useCallback(async () => {
    const [empRes, roleRes, companyRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('first_name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('company_profile').select('name, address, work_start_time, work_end_time').limit(1).maybeSingle(),
    ]);
    const roleMap = new Map<string, string>();
    (roleRes.data || []).forEach((r: { user_id: string; role: string }) => roleMap.set(r.user_id, r.role));
    const merged = (empRes.data || []).map((e) => ({ ...e, role: roleMap.get(e.id) || 'employee' }));
    setEmployeesWithRole(merged as Array<Employee & { role: string }>);
    setCompanyProfile(companyRes.data || null);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetchAttendanceLog();
    fetchLeaveAndAnnouncements();
    fetchEmployeesAndCompany();
  }, [currentUser, fetchAttendanceLog, fetchLeaveAndAnnouncements, fetchEmployeesAndCompany]);

  const getLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });
  };

  const handleClockAction = async () => {
    if (!currentUser) return;
    setLoadingLocation(true);
    try {
      const loc = await getLocation();
      setLocation(loc);
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      if (!clockedIn) {
        await supabase.from('attendance_records').upsert({
          employee_id: currentUser.id,
          date: today,
          time_in: now.toISOString(),
          lat_in: loc.lat,
          lng_in: loc.lng,
          address_in: null,
          status: 'present',
        }, { onConflict: 'employee_id,date' });
        setClockedIn(true);
        setClockInTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        toast.success(`Clocked in at ${now.toLocaleTimeString()} | 📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        fetchAttendanceLog();
      } else {
        const { data: existing } = await supabase.from('attendance_records').select('id').eq('employee_id', currentUser.id).eq('date', today).single();
        if (existing) {
          await supabase.from('attendance_records').update({
            time_out: now.toISOString(),
            lat_out: loc.lat,
            lng_out: loc.lng,
            address_out: null,
          }).eq('id', existing.id);
        }
        setClockedIn(false);
        toast.success(`Clocked out at ${now.toLocaleTimeString()} | 📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        fetchAttendanceLog();
      }
    } catch {
      toast.error('Unable to get location. Please enable GPS.');
    }
    setLoadingLocation(false);
  };

  if (!currentUser) return null;

  const supervisor = currentUser.supervisor_id
    ? employeesWithRole.find((e) => e.id === currentUser.supervisor_id)
    : employeesWithRole.find((e) => e.role === 'supervisor' || e.role === 'admin');
  const coworkers = employeesWithRole.filter(
    (e) => e.role === 'employee' && e.supervisor_id === currentUser.supervisor_id && e.id !== currentUser.id
  );

  const today = currentTime.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const shiftLabel = companyProfile?.work_start_time && companyProfile?.work_end_time
    ? `${companyProfile.work_start_time.slice(0, 5)} - ${companyProfile.work_end_time.slice(0, 5)}`
    : '08:00 - 17:00';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* LEFT COLUMN */}
      <div className="lg:col-span-3 space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {currentUser.first_name[0]}{currentUser.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm text-foreground">{currentUser.first_name.toUpperCase()} {currentUser.last_name.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{currentUser.position || '—'}</p>
              </div>
            </div>

            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Today ({today})</p>
                  <p className="text-xs text-muted-foreground">Shift: REG {shiftLabel}</p>
                </div>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">{currentUser.first_name[0]}{currentUser.last_name[0]}</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Start Time</p>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">{clockInTime || '--:--'}</span>
                      <MapPin className={`h-3 w-3 ${clockedIn ? 'text-success' : 'text-destructive'}`} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">{currentUser.first_name[0]}{currentUser.last_name[0]}</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">End Time</p>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">--:--</span>
                      <MapPin className="h-3 w-3 text-destructive" />
                    </div>
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={handleClockAction} disabled={loadingLocation}>
                {loadingLocation ? 'Getting location...' : clockedIn ? 'Clock Out' : 'Record Time'}
              </Button>

              {location && (
                <p className="text-[10px] text-center text-muted-foreground">
                  📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </p>
              )}

              <button
                type="button"
                onClick={() => setAttendanceLogOpen(true)}
                className="w-full text-center text-xs text-primary font-medium hover:underline flex items-center justify-center gap-1"
              >
                View More
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Today's Teammates</h3>
              <p className="text-xs text-muted-foreground">Give a task to your team by clicking their profile down below.</p>
            </div>
            {supervisor && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Supervisor</p>
                <div className="flex flex-col items-center">
                  <Avatar className="h-14 w-14 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {supervisor.first_name[0]}{supervisor.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-xs font-medium text-foreground mt-1.5 text-center">
                    {supervisor.first_name.toUpperCase()}<br />{supervisor.last_name.toUpperCase()}
                  </p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Your Co-Workers</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {coworkers.slice(0, 4).map((cw) => (
                  <div key={cw.id} className="flex flex-col items-center shrink-0">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        {cw.first_name[0]}{cw.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-[60px] truncate">{cw.first_name}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CENTER COLUMN */}
      <div className="lg:col-span-6 space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Create New Post</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {currentUser.first_name[0]}{currentUser.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm text-muted-foreground">Share something great today...</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-sm text-foreground">My Onboarding</h3>
                <p className="text-xs text-muted-foreground">Total progress that you completed</p>
              </div>
              <button className="text-xs text-primary font-medium">View More</button>
            </div>
            <Progress value={15} className="h-2" />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">0%</span>
              <span className="text-[10px] text-muted-foreground">100%</span>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="font-semibold text-lg text-foreground mb-3">All Feeds</h3>
          <div className="space-y-3">
            {leaveRequests.map((leave) => (
              <Card key={leave.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {leave.employee_name.split(' ').map((n) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{leave.employee_name.toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">{leave.start_date}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        leave.status === 'approved'
                          ? 'bg-success text-success-foreground border-success'
                          : leave.status === 'pending'
                          ? 'bg-warning text-warning-foreground border-warning'
                          : 'bg-destructive text-destructive-foreground border-destructive'
                      }
                    >
                      {leave.status === 'approved' ? 'Fully Approved' : leave.status === 'pending' ? 'Pending' : 'Rejected'}
                    </Badge>
                  </div>
                  <div className="ml-[52px] mt-1">
                    <p className="text-sm text-foreground capitalize">{leave.leave_type} Leave Request</p>
                    <p className="text-xs text-muted-foreground font-mono">LR-{leave.id.slice(0, 8)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {announcements.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {a.author.split(' ').map((n) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                  <p className="ml-[52px] mt-1 text-sm text-muted-foreground">{a.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="lg:col-span-3 space-y-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Employee Survey</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="polling">
              <TabsList className="w-full bg-transparent border-b rounded-none h-auto p-0 gap-0">
                <TabsTrigger value="polling" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm">Polling</TabsTrigger>
                <TabsTrigger value="survey" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm">Survey</TabsTrigger>
              </TabsList>
              <TabsContent value="polling" className="pt-6">
                <div className="flex flex-col items-center text-center py-4">
                  <div className="h-20 w-20 bg-muted rounded-lg flex items-center justify-center mb-3">
                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No records to display</p>
                </div>
              </TabsContent>
              <TabsContent value="survey" className="pt-6">
                <div className="flex flex-col items-center text-center py-4">
                  <div className="h-20 w-20 bg-muted rounded-lg flex items-center justify-center mb-3">
                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No records to display</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Today's Task</CardTitle>
              <button className="text-xs text-primary font-medium">View More</button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="you">
              <TabsList className="w-full bg-transparent border-b rounded-none h-auto p-0 gap-0">
                <TabsTrigger value="you" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm">You</TabsTrigger>
                <TabsTrigger value="coworkers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm">Co-Workers</TabsTrigger>
              </TabsList>
              <TabsContent value="you" className="pt-6">
                <div className="flex flex-col items-center text-center py-4">
                  <p className="text-lg">🎉</p>
                  <p className="text-sm font-medium text-foreground mt-2">Hooray! All tasks are caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">Break a leg, stay productive!</p>
                </div>
              </TabsContent>
              <TabsContent value="coworkers" className="pt-6">
                <div className="flex flex-col items-center text-center py-4">
                  <p className="text-sm text-muted-foreground">No co-worker tasks</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Company Information</CardTitle>
              <button className="text-xs text-primary font-medium">View More</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">{companyProfile?.name || 'B1G Corporation'}</p>
                <p className="text-xs text-muted-foreground">Technology & Services</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>📍 {companyProfile?.address || 'Manila, Philippines'}</p>
              <p>👥 {employeesWithRole.length} Employees</p>
              <p>🕐 Mon-Fri, {shiftLabel}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={attendanceLogOpen} onOpenChange={setAttendanceLogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Attendance Log
            </DialogTitle>
            <DialogDescription>Your recent attendance records. Time in, time out, and status.</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto flex-1 -mx-1 px-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Time Out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceLog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No attendance records yet</TableCell>
                  </TableRow>
                ) : (
                  attendanceLog.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.date}</TableCell>
                      <TableCell className="font-mono text-sm">{record.time_in ?? '--:--'}</TableCell>
                      <TableCell className="font-mono text-sm">{record.time_out ?? '--:--'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusVariant[record.status]}>{record.status.replace('_', ' ')}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
