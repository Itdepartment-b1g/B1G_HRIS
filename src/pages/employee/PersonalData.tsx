import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Mail, Phone, Briefcase, Building2, Calendar, Hash, Clock, Users } from 'lucide-react';

interface ShiftInfo {
  name: string;
  days: string[];
  start_time: string;
  end_time: string;
}

interface SupervisorInfo {
  first_name: string;
  last_name: string;
  position: string | null;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDays(days: string[]): string {
  if (!days || days.length === 0) return '—';
  if (days.length === 7) return 'Everyday';
  if (days.length === 6 && !days.includes('Sun')) return 'Mon–Sat';
  if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) return 'Mon–Fri';
  return days.join(', ');
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) => (
  <div className="flex items-start gap-3 py-3 border-b last:border-0">
    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm text-foreground mt-0.5 break-words">{value || '—'}</p>
    </div>
  </div>
);

const PersonalData = () => {
  const { user, loading } = useCurrentUser();
  const [shifts, setShifts] = useState<ShiftInfo[]>([]);
  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadExtra = async () => {
      setLoadingExtra(true);

      const [shiftsRes, supervisorRes] = await Promise.all([
        supabase
          .from('employee_shifts')
          .select('shifts(name, days, start_time, end_time)')
          .eq('employee_id', user.id),
        user.supervisor_id
          ? supabase
              .from('employees')
              .select('first_name, last_name, position')
              .eq('id', user.supervisor_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const shiftData = (shiftsRes.data || [])
        .map((r: any) => r.shifts)
        .filter(Boolean) as ShiftInfo[];
      setShifts(shiftData);
      setSupervisor((supervisorRes as any).data || null);
      setLoadingExtra(false);
    };

    loadExtra();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const roleLabel = (user.role || 'employee').replace('_', ' ');
  const startDate = user.hired_date
    ? new Date(user.hired_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Personal Data</h1>
        <p className="text-muted-foreground text-sm mt-1">Your profile and employment information</p>
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                {user.first_name[0]}{user.last_name[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {user.first_name} {user.last_name}
              </h2>
              <p className="text-muted-foreground text-sm">{user.position || '—'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {user.employee_code}
                </span>
                <Badge variant="outline" className="capitalize text-xs">
                  {roleLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={user.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-500 border-gray-200'}
                >
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information */}
        <Card>
          <CardContent className="pt-5 pb-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">Contact Information</h3>
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Phone} label="Phone" value={user.phone} />
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardContent className="pt-5 pb-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">Employment Details</h3>
            <InfoRow icon={Building2} label="Department" value={user.department} />
            <InfoRow icon={Briefcase} label="Position" value={user.position} />
            <InfoRow icon={Hash} label="Employee Code" value={user.employee_code} />
            <InfoRow icon={Calendar} label="Start Date" value={startDate} />
          </CardContent>
        </Card>

        {/* Supervisor */}
        <Card>
          <CardContent className="pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">Supervisor</h3>
            {loadingExtra ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : supervisor ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-semibold">
                    {supervisor.first_name[0]}{supervisor.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {supervisor.first_name} {supervisor.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{supervisor.position || 'Supervisor'}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <p className="text-sm">No supervisor assigned</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shifts */}
        <Card>
          <CardContent className="pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">Assigned Shifts</h3>
            {loadingExtra ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : shifts.length > 0 ? (
              <div className="space-y-2">
                {shifts.map((shift, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{shift.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDays(shift.days)} · {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
                <p className="text-sm">No shifts assigned</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PersonalData;
