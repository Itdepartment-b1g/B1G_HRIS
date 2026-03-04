import { useState, useEffect } from 'react';
import { MapPin, ChevronUp, ChevronDown, Clock, FileText, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { departmentStats, attendanceRecords, announcements, leaveRequests, currentUser, employees } from '@/data/mockData';
import { toast } from 'sonner';

const Dashboard = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showDetail, setShowDetail] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    setLoadingLocation(true);
    try {
      const loc = await getLocation();
      setLocation(loc);
      if (!clockedIn) {
        setClockedIn(true);
        setClockInTime(currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        toast.success(`Clocked in at ${currentTime.toLocaleTimeString()} | 📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
      } else {
        setClockedIn(false);
        toast.success(`Clocked out at ${currentTime.toLocaleTimeString()} | 📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
      }
    } catch {
      toast.error('Unable to get location. Please enable GPS.');
    }
    setLoadingLocation(false);
  };

  const supervisor = employees.find(e => e.id === '2');
  const coworkers = employees.filter(e => e.role === 'employee' && e.is_active);

  const today = currentTime.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* LEFT COLUMN */}
      <div className="lg:col-span-3 space-y-5">
        {/* Attendance Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Employee info */}
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {currentUser.first_name[0]}{currentUser.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm text-foreground">{currentUser.first_name.toUpperCase()} {currentUser.last_name.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{currentUser.position}</p>
              </div>
            </div>

            {/* Time card */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Today ({today})</p>
                  <p className="text-xs text-muted-foreground">Shift: REG 8am to 5pm [08:00 - 17:00]</p>
                </div>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Start/End Time */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">FL</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Start Time</p>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">
                        {clockInTime || '--:--'}
                      </span>
                      <MapPin className={`h-3 w-3 ${clockedIn ? 'text-success' : 'text-destructive'}`} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">FL</span>
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

              {/* Record Time Button */}
              <Button
                className="w-full"
                onClick={handleClockAction}
                disabled={loadingLocation}
              >
                {loadingLocation ? 'Getting location...' : clockedIn ? 'Clock Out' : 'Record Time'}
              </Button>

              {location && (
                <p className="text-[10px] text-center text-muted-foreground">
                  📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </p>
              )}

              <button className="w-full text-center text-xs text-primary font-medium">
                View More
              </button>
            </div>

            {/* Toggle Detail */}
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="flex items-center gap-1 mx-auto text-xs text-primary font-medium"
            >
              {showDetail ? 'Hide Detail' : 'Show Detail'}
              {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </CardContent>
        </Card>

        {/* Today's Teammates */}
        {showDetail && (
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Today's Teammates</h3>
                <p className="text-xs text-muted-foreground">Give a task to your team by clicking their profile down below.</p>
              </div>

              {/* Supervisor */}
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

              {/* Co-Workers */}
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
                      <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-[60px] truncate">
                        {cw.first_name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* CENTER COLUMN */}
      <div className="lg:col-span-6 space-y-5">
        {/* Create New Post */}
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

        {/* Onboarding Progress */}
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

        {/* All Feeds */}
        <div>
          <h3 className="font-semibold text-lg text-foreground mb-3">All Feeds</h3>
          <div className="space-y-3">
            {/* Leave requests as feed items */}
            {leaveRequests.map((leave) => (
              <Card key={leave.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {leave.employee_name.split(' ').map(n => n[0]).join('')}
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
                    <p className="text-xs text-muted-foreground font-mono">LR-{leave.id.padStart(6, '0')}</p>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Announcements as feed items */}
            {announcements.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {a.author.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.created_at}</p>
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
        {/* Employee Survey */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Employee Survey</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="polling">
              <TabsList className="w-full bg-transparent border-b rounded-none h-auto p-0 gap-0">
                <TabsTrigger
                  value="polling"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm"
                >
                  Polling
                </TabsTrigger>
                <TabsTrigger
                  value="survey"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm"
                >
                  Survey
                </TabsTrigger>
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

        {/* Today's Task */}
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
                <TabsTrigger
                  value="you"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm"
                >
                  You
                </TabsTrigger>
                <TabsTrigger
                  value="coworkers"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 pb-2 text-sm"
                >
                  Co-Workers
                </TabsTrigger>
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

        {/* Company Information */}
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
                <p className="text-sm font-semibold text-foreground">B1G Corporation</p>
                <p className="text-xs text-muted-foreground">Technology & Services</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>📍 Manila, Philippines</p>
              <p>👥 {departmentStats.totalEmployees} Employees</p>
              <p>🕐 Mon-Fri, 8:00 AM - 5:00 PM</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
