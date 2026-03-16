import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown, Clock, FileText, Building2, ChevronLeft, ChevronRight, Calendar, Briefcase, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { cn, timeTo12Hour } from '@/lib/utils';
import { computeAttendanceStatusFromTimeIn, getWeekdayForDate } from '@/lib/attendanceStatus';
import type { AttendanceRecord } from '@/types';
import type { Employee } from '@/types';
import { toast } from 'sonner';

const statusVariant: Record<string, string> = {
  present: 'bg-green-100 text-green-700 border-green-200',
  eti: 'bg-sky-100 text-sky-700 border-sky-200',
  lti: 'bg-amber-100 text-amber-700 border-amber-200',
  late: 'bg-amber-100 text-amber-700 border-amber-200',
  eto: 'bg-orange-100 text-orange-700 border-orange-200',
  lto: 'bg-violet-100 text-violet-700 border-violet-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  half_day: 'bg-blue-100 text-blue-700 border-blue-200',
  on_leave: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatTime(t: string | null): string {
  if (!t) return '--:--';
  const d = new Date(t);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Expand a date range into working-day YYYY-MM-DD strings (excludes Sundays, non-working day). */
function getWorkingDatesInRange(startStr: string, endStr: string): string[] {
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  const dates: string[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() !== 0) {
      dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [attendanceLogOpen, setAttendanceLogOpen] = useState(false);
  const [workLocations, setWorkLocations] = useState<Array<{ id: string; name: string; latitude: number | null; longitude: number | null; radius_meters: number | null; allow_anywhere: boolean }>>([]);
  const [assignedShift, setAssignedShift] = useState<{ name: string; start_time: string; end_time: string } | null>(null);

  const [attendanceLog, setAttendanceLog] = useState<AttendanceRecord[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; author: string; created_at: string }>>([]);
  const [calendarLeaveData, setCalendarLeaveData] = useState<{
    myLeaveDates: Set<string>;
    myBusinessTripDates: Set<string>;
    teamLeaveByDate: Map<string, string[]>;
    teamBusinessTripByDate: Map<string, string[]>;
    myLeaveDetailsByDate: Map<string, Array<{ leave_type: string; start_date: string; end_date: string; number_of_days?: number; reason?: string }>>;
    myBusinessTripDetailsByDate: Map<string, Array<{ trip_type: string; destination: string; purpose?: string; start_date: string; end_date: string }>>;
    teamLeaveDetailsByDate: Map<string, Array<{ name: string; leave_type: string; start_date: string; end_date: string }>>;
    teamBusinessTripDetailsByDate: Map<string, Array<{ name: string; trip_type: string; destination: string; start_date: string; end_date: string }>>;
  }>({
    myLeaveDates: new Set(),
    myBusinessTripDates: new Set(),
    teamLeaveByDate: new Map(),
    teamBusinessTripByDate: new Map(),
    myLeaveDetailsByDate: new Map(),
    myBusinessTripDetailsByDate: new Map(),
    teamLeaveDetailsByDate: new Map(),
    teamBusinessTripDetailsByDate: new Map(),
  });
  const [leaveFeedItems, setLeaveFeedItems] = useState<Array<{
    id: string;
    type: 'leave_request';
    employee_name: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    number_of_days?: number;
    status: string;
    reason?: string;
    created_at: string;
    approver_name?: string | null;
  }>>([]);
  const [employeesWithRole, setEmployeesWithRole] = useState<Array<Employee & { role: string; roles: string[] }>>([]);
  const [companyProfile, setCompanyProfile] = useState<{ name: string; address?: string; work_start_time?: string; work_end_time?: string } | null>(null);
  const [calendarDateDialog, setCalendarDateDialog] = useState<{
    dateStr: string;
    dateLabel: string;
    isMyLeave: boolean;
    isMyBusinessTrip: boolean;
    teamOnLeave: string[];
    teamOnBusinessTrip: string[];
    myLeaveDetails: Array<{ leave_type: string; start_date: string; end_date: string; number_of_days?: number; reason?: string }>;
    myBusinessTripDetails: Array<{ trip_type: string; destination: string; purpose?: string; start_date: string; end_date: string }>;
    teamLeaveDetails: Array<{ name: string; leave_type: string; start_date: string; end_date: string }>;
    teamBusinessTripDetails: Array<{ name: string; trip_type: string; destination: string; start_date: string; end_date: string }>;
  } | null>(null);

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

  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*, author:employees!author_id(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(10);
    setAnnouncements((data || []).map((a: any) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
      created_at: a.created_at,
    })));
  }, []);

  const fetchLeaveFeed = useCallback(async () => {
    if (!currentUser?.id) return;
    let query = supabase
      .from('leave_requests')
      .select('*, employee:employees!employee_id(first_name, last_name), approver:employees!approved_by(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(15);
    const isSuperAdmin = currentUser.roles?.includes('super_admin');
    const isAdminOrSupervisor = currentUser.roles?.includes('admin') || currentUser.roles?.includes('supervisor') || currentUser.roles?.includes('manager');
    if (isSuperAdmin) {
    } else if (isAdminOrSupervisor) {
      const { data: esData } = await supabase.from('employee_supervisors').select('employee_id').eq('supervisor_id', currentUser.id);
      const supervisedIds = new Set((esData || []).map((r) => r.employee_id));
      const { data: empData } = await supabase.from('employees').select('id').eq('supervisor_id', currentUser.id).eq('is_active', true);
      (empData || []).forEach((r) => supervisedIds.add(r.id));
      if (currentUser.roles?.includes('admin')) {
        const { data: allEmps } = await supabase.from('employees').select('id').eq('is_active', true);
        (allEmps || []).forEach((r) => supervisedIds.add(r.id));
      }
      const ids = Array.from(supervisedIds);
      if (ids.length === 0) {
        setLeaveFeedItems([]);
        return;
      }
      query = query.in('employee_id', ids);
    } else {
      query = query.eq('employee_id', currentUser.id);
    }
    const { data } = await query;
    setLeaveFeedItems((data || []).map((r: any) => ({
      id: r.id,
      type: 'leave_request' as const,
      employee_name: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown',
      leave_type: r.leave_type || '',
      start_date: r.start_date,
      end_date: r.end_date,
      number_of_days: r.number_of_days,
      status: r.status || 'pending',
      reason: r.reason,
      created_at: r.created_at,
      approver_name: r.approver ? `${r.approver.first_name} ${r.approver.last_name}` : null,
    })));
  }, [currentUser?.id, currentUser?.roles]);

  const fetchApprovedLeavesForCalendar = useCallback(async () => {
    if (!currentUser?.id) return;
    const year = new Date().getFullYear();
    const rangeStart = `${year}-01-01`;
    const rangeEnd = `${year}-12-31`;

    let employeeIds: string[] = [currentUser.id];
    const isSuperAdmin = currentUser.roles?.includes('super_admin');
    const isAdminOrSupervisor = currentUser.roles?.includes('admin') || currentUser.roles?.includes('supervisor') || currentUser.roles?.includes('manager');
    if (isSuperAdmin || isAdminOrSupervisor) {
      const { data: esData } = await supabase.from('employee_supervisors').select('employee_id').eq('supervisor_id', currentUser.id);
      const supervisedIds = new Set((esData || []).map((r) => r.employee_id));
      const { data: empData } = await supabase.from('employees').select('id').eq('supervisor_id', currentUser.id).eq('is_active', true);
      (empData || []).forEach((r) => supervisedIds.add(r.id));
      if (isSuperAdmin || currentUser.roles?.includes('admin')) {
        const { data: allEmps } = await supabase.from('employees').select('id').eq('is_active', true);
        (allEmps || []).forEach((r) => supervisedIds.add(r.id));
      }
      employeeIds = Array.from(supervisedIds);
    }

    const [leaveRes, tripRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('employee_id, leave_type, start_date, end_date, number_of_days, reason, employee:employees!employee_id(first_name, last_name)')
        .in('employee_id', employeeIds)
        .eq('status', 'approved')
        .gte('end_date', rangeStart)
        .lte('start_date', rangeEnd),
      supabase
        .from('business_trips')
        .select('employee_id, trip_type, destination, purpose, start_date, end_date, employee:employees!employee_id(first_name, last_name)')
        .in('employee_id', employeeIds)
        .eq('status', 'approved')
        .gte('end_date', rangeStart)
        .lte('start_date', rangeEnd),
    ]);

    const myLeaveDates = new Set<string>();
    const myBusinessTripDates = new Set<string>();
    const teamLeaveByDate = new Map<string, string[]>();
    const teamBusinessTripByDate = new Map<string, string[]>();
    const myLeaveDetailsByDate = new Map<string, Array<{ leave_type: string; start_date: string; end_date: string; number_of_days?: number; reason?: string }>>();
    const myBusinessTripDetailsByDate = new Map<string, Array<{ trip_type: string; destination: string; purpose?: string; start_date: string; end_date: string }>>();
    const teamLeaveDetailsByDate = new Map<string, Array<{ name: string; leave_type: string; start_date: string; end_date: string }>>();
    const teamBusinessTripDetailsByDate = new Map<string, Array<{ name: string; trip_type: string; destination: string; start_date: string; end_date: string }>>();

    (leaveRes.data || []).forEach((r: any) => {
      const dates = getWorkingDatesInRange(r.start_date, r.end_date);
      const name = r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown';
      const isMe = r.employee_id === currentUser.id;
      const detail = {
        leave_type: r.leave_type || '',
        start_date: r.start_date,
        end_date: r.end_date,
        number_of_days: r.number_of_days,
        reason: r.reason,
      };
      dates.forEach((dateStr) => {
        if (isMe) {
          myLeaveDates.add(dateStr);
          const arr = myLeaveDetailsByDate.get(dateStr) || [];
          if (!arr.some((d) => d.start_date === detail.start_date && d.end_date === detail.end_date)) {
            arr.push(detail);
            myLeaveDetailsByDate.set(dateStr, arr);
          }
        } else {
          const arr = teamLeaveByDate.get(dateStr) || [];
          if (!arr.includes(name)) arr.push(name);
          teamLeaveByDate.set(dateStr, arr);
          const detailArr = teamLeaveDetailsByDate.get(dateStr) || [];
          if (!detailArr.some((d) => d.name === name && d.start_date === detail.start_date)) {
            detailArr.push({ name, leave_type: detail.leave_type, start_date: detail.start_date, end_date: detail.end_date });
            teamLeaveDetailsByDate.set(dateStr, detailArr);
          }
        }
      });
    });

    const TRIP_TYPE_LABELS: Record<string, string> = {
      work_visit_domestic: 'Work Visit (Domestic)',
      work_visit_overseas: 'Work Visit (Overseas)',
      training: 'Training',
    };

    (tripRes.data || []).forEach((r: any) => {
      const dates = getWorkingDatesInRange(r.start_date, r.end_date);
      const name = r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown';
      const isMe = r.employee_id === currentUser.id;
      const detail = {
        trip_type: TRIP_TYPE_LABELS[r.trip_type ?? ''] ?? r.trip_type ?? '',
        destination: r.destination || '',
        purpose: r.purpose,
        start_date: r.start_date,
        end_date: r.end_date,
      };
      dates.forEach((dateStr) => {
        if (isMe) {
          myBusinessTripDates.add(dateStr);
          const arr = myBusinessTripDetailsByDate.get(dateStr) || [];
          if (!arr.some((d) => d.start_date === detail.start_date && d.end_date === detail.end_date)) {
            arr.push(detail);
            myBusinessTripDetailsByDate.set(dateStr, arr);
          }
        } else {
          const arr = teamBusinessTripByDate.get(dateStr) || [];
          if (!arr.includes(name)) arr.push(name);
          teamBusinessTripByDate.set(dateStr, arr);
          const detailArr = teamBusinessTripDetailsByDate.get(dateStr) || [];
          if (!detailArr.some((d) => d.name === name && d.start_date === detail.start_date)) {
            detailArr.push({ name, trip_type: detail.trip_type, destination: detail.destination, start_date: detail.start_date, end_date: detail.end_date });
            teamBusinessTripDetailsByDate.set(dateStr, detailArr);
          }
        }
      });
    });

    setCalendarLeaveData({
      myLeaveDates,
      myBusinessTripDates,
      teamLeaveByDate,
      teamBusinessTripByDate,
      myLeaveDetailsByDate,
      myBusinessTripDetailsByDate,
      teamLeaveDetailsByDate,
      teamBusinessTripDetailsByDate,
    });
  }, [currentUser?.id, currentUser?.roles]);

  const fetchEmployeesAndCompany = useCallback(async () => {
    const [empRes, roleRes, companyRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('first_name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('company_profile').select('name, address, work_start_time, work_end_time').limit(1).maybeSingle(),
    ]);
    const roleMap = new Map<string, string[]>();
    (roleRes.data || []).forEach((r: { user_id: string; role: string }) => {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const merged = (empRes.data || []).map((e) => {
      const roles = roleMap.get(e.id) || ['employee'];
      return { ...e, roles, role: roles[0] || 'employee' };
    });
    setEmployeesWithRole(merged as Array<Employee & { role: string; roles: string[] }>);
    setCompanyProfile(companyRes.data || null);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchWorkLocations = useCallback(async () => {
    if (!currentUser?.id) return;

    // Try to resolve from today's shift (if shift has a linked work_location_id)
    const weekday = getWeekdayForDate(new Date());
    const { data: esData } = await supabase
      .from('employee_shifts')
      .select('shift:shifts(work_location_id, days)')
      .eq('employee_id', currentUser.id);
    const shifts = (esData || []).map((s: any) => s.shift).filter(Boolean);
    const shiftForToday = shifts.find((s: any) => s.days?.includes(weekday));

    if (shiftForToday?.work_location_id) {
      // Shift has a linked location — use only that one
      const { data: wlData } = await supabase
        .from('work_locations')
        .select('id, name, latitude, longitude, radius_meters, allow_anywhere')
        .eq('id', shiftForToday.work_location_id)
        .eq('is_active', true)
        .maybeSingle();
      setWorkLocations(wlData ? [wlData] : []);
    } else {
      // Fallback: all employee work locations
      const { data: ewData } = await supabase
        .from('employee_work_locations')
        .select('work_location_id')
        .eq('employee_id', currentUser.id);
      const wlIds = (ewData || []).map((r) => r.work_location_id);
      if (wlIds.length === 0) {
        setWorkLocations([]);
      } else {
        const { data: wlData } = await supabase
          .from('work_locations')
          .select('id, name, latitude, longitude, radius_meters, allow_anywhere')
          .in('id', wlIds)
          .eq('is_active', true);
        setWorkLocations((wlData || []) as any);
      }
    }
  }, [currentUser?.id]);

  const fetchAssignedShift = useCallback(async () => {
    if (!currentUser?.id) return;
    const weekday = getWeekdayForDate(new Date());
    const { data } = await supabase
      .from('employee_shifts')
      .select('shift:shifts(name, start_time, end_time, days)')
      .eq('employee_id', currentUser.id);
    const shifts = (data || []).map((s: any) => s.shift).filter(Boolean);
    const shiftForToday = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
    if (shiftForToday) {
      const st = (shiftForToday.start_time || '08:00:00').toString();
      const et = (shiftForToday.end_time || '17:00:00').toString();
      setAssignedShift({ name: shiftForToday.name || 'REG', start_time: st, end_time: et });
    } else {
      setAssignedShift(null);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    fetchAttendanceLog();
    fetchAnnouncements();
    fetchLeaveFeed();
    fetchApprovedLeavesForCalendar();
    fetchEmployeesAndCompany();
    fetchWorkLocations();
    fetchAssignedShift();
  }, [currentUser, fetchAttendanceLog, fetchAnnouncements, fetchLeaveFeed, fetchApprovedLeavesForCalendar, fetchEmployeesAndCompany, fetchWorkLocations, fetchAssignedShift]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `employee_id=eq.${currentUser.id}` },
        () => fetchAttendanceLog()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchAnnouncements())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchLeaveFeed();
        fetchApprovedLeavesForCalendar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchAttendanceLog, fetchAnnouncements, fetchLeaveFeed, fetchApprovedLeavesForCalendar]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = attendanceLog.find((r) => r.date === today);
    if (todayRecord) {
      const hasTimeOut = !!todayRecord.time_out;
      setClockedIn(!!todayRecord.time_in && !hasTimeOut);
      setClockInTime(todayRecord.time_in ?? null);
      setClockOutTime(todayRecord.time_out ?? null);
    } else {
      setClockedIn(false);
      setClockInTime(null);
      setClockOutTime(null);
    }
  }, [attendanceLog]);

  // Login-exempted: primary handler is pg_cron (server-side, no login needed).
  // This client-side fallback ensures the record appears immediately when the user opens the app,
  // in case the cron hasn't fired yet. Uses onConflict so it won't overwrite cron-created records.
  useEffect(() => {
    if (!currentUser?.login_exempted || !assignedShift) return;

    const recordAttendance = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        const pad = (t: string) => (t.length >= 8 ? t : t + ':00'.slice(0, 8 - t.length));
        const st = pad((assignedShift.start_time || '08:00:00').toString());
        const et = pad((assignedShift.end_time || '17:00:00').toString());
        const [y, m, d] = today.split('-').map(Number);
        const parseTime = (t: string) => t.split(':').map((n) => parseInt(n, 10) || 0);
        const [sh, sm, ss] = parseTime(st);
        const [eh, em, es] = parseTime(et);
        const timeInDate = new Date(y, m - 1, d, sh, sm, ss || 0);
        const timeOutDate = new Date(y, m - 1, d, eh, em, es || 0);
        timeInDate.setMilliseconds(0);
        timeOutDate.setMilliseconds(0);
        const timeInIso = timeInDate.toISOString();
        const timeOutIso = timeOutDate.toISOString();

        const { error } = await supabase
          .from('attendance_records')
          .upsert({
            employee_id: currentUser.id,
            date: today,
            time_in: timeInIso,
            time_out: timeOutIso,
            status: 'present',
            minutes_late: 0,
          }, { onConflict: 'employee_id,date', ignoreDuplicates: true });

        if (error) {
          console.error('[Login-exempted] Failed to auto-record attendance:', error.message);
        }
      } catch (err) {
        console.error('[Login-exempted] Unexpected error auto-recording attendance:', err);
      }
      fetchAttendanceLog();
    };

    recordAttendance();
  }, [currentUser?.id, currentUser?.login_exempted, assignedShift, fetchAttendanceLog]);

  const uploadPhoto = async (blob: Blob, employeeId: string, date: string, mode: 'in' | 'out'): Promise<string | null> => {
    const ext = 'jpg';
    const path = `${employeeId}/${date}_time_${mode}.${ext}`;
    const { data, error } = await supabase.storage.from('attendance-photos').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.error('Photo upload failed:', error);
      return null;
    }
    const { data: urlData } = supabase.storage.from('attendance-photos').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleTimeInConfirm = async (data: { photoBlob: Blob; lat: number; lng: number }) => {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const existing = attendanceLog.find((r) => r.date === today);
    if (existing?.time_in) {
      toast.error('You have already timed in today.');
      return;
    }
    setLoadingLocation(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const timeInIso = now.toISOString();
      setLocation({ lat: data.lat, lng: data.lng });

      const photoUrl = await uploadPhoto(data.photoBlob, currentUser.id, today, 'in');

      const weekday = getWeekdayForDate(today);
      const [shiftRes, empRes] = await Promise.all([
        supabase.from('employee_shifts').select('shift:shifts(start_time, grace_period_minutes, days)').eq('employee_id', currentUser.id),
        supabase.from('employees').select('late_exempted, grace_period_exempted').eq('id', currentUser.id).single(),
      ]);
      const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
      const shiftForToday = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
      const shiftInfo = shiftForToday ? { start_time: shiftForToday.start_time || '08:00:00', grace_period_minutes: shiftForToday.grace_period_minutes ?? 15, days: shiftForToday.days } : null;
      const exemptions = empRes.data ? { late_exempted: empRes.data.late_exempted, grace_period_exempted: empRes.data.grace_period_exempted } : undefined;
      const { status, minutesLate } = computeAttendanceStatusFromTimeIn({ timeInIso, date: today, shift: shiftInfo, exemptions });

      await supabase.from('attendance_records').upsert({
        employee_id: currentUser.id,
        date: today,
        time_in: timeInIso,
        lat_in: data.lat,
        lng_in: data.lng,
        address_in: null,
        time_in_photo_url: photoUrl,
        status,
        minutes_late: minutesLate,
      }, { onConflict: 'employee_id,date' });
      setClockedIn(true);
      setClockInTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setClockOutTime(null);
      const statusMsg = status === 'late' ? ` (Late — ${(minutesLate / 60).toFixed(2)} hrs past start)` : '';
      toast.success(`Time in at ${now.toLocaleTimeString()}${statusMsg}`);
      fetchAttendanceLog();
    } catch (err) {
      toast.error('Failed to record time in');
    }
    setLoadingLocation(false);
  };

  const handleTimeOutConfirm = async (data: { photoBlob: Blob; lat: number; lng: number }) => {
    if (!currentUser || !clockedIn) return;
    const today = new Date().toISOString().split('T')[0];
    const existing = attendanceLog.find((r) => r.date === today);
    if (existing?.time_out) {
      toast.error('You have already timed out today.');
      return;
    }
    setLoadingLocation(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      setLocation({ lat: data.lat, lng: data.lng });

      const photoUrl = await uploadPhoto(data.photoBlob, currentUser.id, today, 'out');

      const { data: existing } = await supabase.from('attendance_records').select('id').eq('employee_id', currentUser.id).eq('date', today).single();
      if (existing) {
        await supabase.from('attendance_records').update({
          time_out: now.toISOString(),
          lat_out: data.lat,
          lng_out: data.lng,
          address_out: null,
          time_out_photo_url: photoUrl,
        }).eq('id', existing.id);
      }
      setClockedIn(false);
      setClockOutTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      toast.success(`Time out at ${now.toLocaleTimeString()}`);
      fetchAttendanceLog();
    } catch {
      toast.error('Failed to record time out');
    }
    setLoadingLocation(false);
  };

  if (!currentUser) return null;

  const supervisor = currentUser.supervisor_id
    ? employeesWithRole.find((e) => e.id === currentUser.supervisor_id)
    : employeesWithRole.find((e) => (e as any).roles?.includes('supervisor') || (e as any).roles?.includes('admin'));
  const coworkers = employeesWithRole.filter(
    (e) => ((e as any).roles?.includes('employee') || (e as any).roles?.includes('intern')) && e.supervisor_id === currentUser.supervisor_id && e.id !== currentUser.id
  );

  const today = currentTime.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayRecord = attendanceLog.find((r) => r.date === todayDateStr);
  const hasTimeIn = !!todayRecord?.time_in;
  const hasTimeOut = !!todayRecord?.time_out;

  const shiftLabel = assignedShift
    ? `${timeTo12Hour(assignedShift.start_time)} - ${timeTo12Hour(assignedShift.end_time)}`
    : companyProfile?.work_start_time && companyProfile?.work_end_time
    ? `${timeTo12Hour(companyProfile.work_start_time)} - ${timeTo12Hour(companyProfile.work_end_time)}`
    : '8:00 AM - 5:00 PM';
  const shiftName = assignedShift?.name ?? 'REG';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* LEFT COLUMN */}
      <div className="lg:col-span-3 space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {currentUser.first_name[0]}{currentUser.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground truncate sm:whitespace-normal sm:overflow-visible">{currentUser.first_name.toUpperCase()} {currentUser.last_name.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground truncate sm:whitespace-normal sm:overflow-visible">{currentUser.position || '—'}</p>
              </div>
            </div>

            <div className="bg-card border rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex items-start sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Today ({today})</p>
                  <p className="text-xs text-muted-foreground break-words">Shift: {shiftName} {shiftLabel}</p>
                </div>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">{currentUser.first_name[0]}{currentUser.last_name[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Start Time</p>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">{clockInTime || '--:--'}</span>
                      <MapPin className={`h-3 w-3 shrink-0 ${clockedIn ? 'text-success' : 'text-destructive'}`} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">{currentUser.first_name[0]}{currentUser.last_name[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">End Time</p>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">{clockOutTime || '--:--'}</span>
                      <MapPin className={cn('h-3 w-3 shrink-0', clockOutTime ? 'text-success' : 'text-destructive')} />
                    </div>
                  </div>
                </div>
              </div>

              {currentUser?.login_exempted ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Login exempted — attendance is auto-recorded based on your assigned shift.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="w-full sm:flex-1"
                    onClick={() => navigate('/dashboard/time-in-out?mode=in')}
                    disabled={loadingLocation || hasTimeIn}
                    variant={hasTimeIn ? 'outline' : 'default'}
                  >
                    {loadingLocation ? '...' : 'Time In'}
                  </Button>
                  <Button
                    className="w-full sm:flex-1"
                    onClick={() => navigate('/dashboard/time-in-out?mode=out')}
                    disabled={loadingLocation || hasTimeOut || !hasTimeIn}
                    variant={hasTimeOut || !hasTimeIn ? 'outline' : 'default'}
                  >
                    {loadingLocation ? '...' : 'Time Out'}
                  </Button>
                </div>
              )}

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
        <div>
          <h3 className="font-semibold text-lg text-foreground mb-3">All Feeds</h3>
          <div className="space-y-3">
            {[
              ...announcements.map((a) => ({ ...a, type: 'announcement' as const })),
              ...leaveFeedItems.map((l) => ({ ...l, type: 'leave_request' as const })),
            ]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 20)
              .map((item) =>
                item.type === 'announcement' ? (
                  <Card key={`ann-${item.id}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {item.author.split(' ').map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                      <p className="ml-[52px] mt-1 text-sm text-muted-foreground">{item.content}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card
                    key={`leave-${item.id}`}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => navigate(currentUser?.roles?.some((r) => ['super_admin', 'admin', 'supervisor', 'manager'].includes(r)) ? '/dashboard/leave?tab=approval' : '/dashboard/leave')}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {item.employee_name.split(' ').map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {item.employee_name} — {item.leave_type}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.start_date).toLocaleDateString()} – {new Date(item.end_date).toLocaleDateString()}
                              {item.number_of_days != null ? ` • ${item.number_of_days} day${item.number_of_days !== 1 ? 's' : ''}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            item.status === 'approved'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : item.status === 'rejected'
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      {item.reason && <p className="ml-[52px] mt-1 text-sm text-muted-foreground line-clamp-2">{item.reason}</p>}
                      {(item.status === 'approved' || item.status === 'rejected') && item.approver_name && (
                        <p className="ml-[52px] mt-1 text-xs text-muted-foreground">
                          {item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.approver_name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="lg:col-span-3 space-y-5">
        {/* Calendar - system date */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Calendar</CardTitle>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                  className="p-1.5 rounded-md hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                  className="p-1.5 rounded-md hover:bg-muted"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-[10px] font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
              {(() => {
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const first = new Date(year, month, 1);
                const last = new Date(year, month + 1, 0);
                const startPad = first.getDay();
                const daysInMonth = last.getDate();
                const todayDate = new Date();
                const isToday = (d: number) =>
                  todayDate.getFullYear() === year && todayDate.getMonth() === month && todayDate.getDate() === d;
                const pad = (n: number) => String(n).padStart(2, '0');
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < startPad; i++) cells.push(<div key={`pad-${i}`} className="aspect-square" />);
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
                  const isMyLeave = calendarLeaveData.myLeaveDates.has(dateStr);
                  const isMyBusinessTrip = calendarLeaveData.myBusinessTripDates.has(dateStr);
                  const teamOnLeave = calendarLeaveData.teamLeaveByDate.get(dateStr) || [];
                  const teamOnBusinessTrip = calendarLeaveData.teamBusinessTripByDate.get(dateStr) || [];
                  const hasTeamLeave = teamOnLeave.length > 0;
                  const hasTeamBusinessTrip = teamOnBusinessTrip.length > 0;
                  const hasLeave = isMyLeave || isMyBusinessTrip || hasTeamLeave || hasTeamBusinessTrip;
                  const tooltipText = isMyBusinessTrip
                    ? `You're on business trip`
                    : isMyLeave
                      ? `You're on leave`
                      : hasTeamBusinessTrip || hasTeamLeave
                        ? [
                            hasTeamLeave ? `${teamOnLeave.length} on leave: ${teamOnLeave.join(', ')}` : null,
                            hasTeamBusinessTrip ? `${teamOnBusinessTrip.length} on business trip: ${teamOnBusinessTrip.join(', ')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : null;
                  const handleCellClick = hasLeave
                    ? () =>
                        setCalendarDateDialog({
                          dateStr,
                          dateLabel: new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                          isMyLeave,
                          isMyBusinessTrip,
                          teamOnLeave,
                          teamOnBusinessTrip,
                          myLeaveDetails: calendarLeaveData.myLeaveDetailsByDate.get(dateStr) || [],
                          myBusinessTripDetails: calendarLeaveData.myBusinessTripDetailsByDate.get(dateStr) || [],
                          teamLeaveDetails: calendarLeaveData.teamLeaveDetailsByDate.get(dateStr) || [],
                          teamBusinessTripDetails: calendarLeaveData.teamBusinessTripDetailsByDate.get(dateStr) || [],
                        })
                    : undefined;
                  const cell = (
                    <div
                      role={hasLeave ? 'button' : undefined}
                      tabIndex={hasLeave ? 0 : undefined}
                      onClick={handleCellClick}
                      onKeyDown={
                        hasLeave
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCellClick?.();
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        'aspect-square flex flex-col items-center justify-center text-sm rounded-md transition-colors',
                        hasLeave && 'cursor-pointer',
                        isToday(d)
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : hasLeave
                            ? isMyLeave || isMyBusinessTrip
                              ? 'bg-primary/15 text-primary border border-primary/30 font-medium hover:bg-primary/20'
                              : 'bg-amber-100/80 dark:bg-amber-950/50 border border-amber-200/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70'
                            : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <span>{d}</span>
                      {hasLeave && !isToday(d) && (
                        <span className="mt-0.5 h-1 w-1 rounded-full bg-current opacity-60" aria-hidden />
                      )}
                    </div>
                  );
                  cells.push(
                    tooltipText ? (
                      <Tooltip key={d}>
                        <TooltipTrigger asChild>{cell}</TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          {tooltipText}
                          {hasLeave && (
                            <span className="block mt-1 text-[10px] opacity-80">Click for details</span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <React.Fragment key={d}>{cell}</React.Fragment>
                    )
                  );
                }
                return cells;
              })()}
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={!!calendarDateDialog}
          onOpenChange={(open) => !open && setCalendarDateDialog(null)}
        >
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {calendarDateDialog?.dateLabel}
              </DialogTitle>
              <DialogDescription>
                {calendarDateDialog?.isMyBusinessTrip && calendarDateDialog?.isMyLeave
                  ? "You're on leave and business trip"
                  : calendarDateDialog?.isMyBusinessTrip
                    ? "You're on business trip"
                    : calendarDateDialog?.isMyLeave
                      ? "You're on leave"
                      : (calendarDateDialog?.teamOnLeave.length ?? 0) + (calendarDateDialog?.teamOnBusinessTrip.length ?? 0) > 0
                        ? 'Team members on leave or business trip'
                        : ''}
              </DialogDescription>
            </DialogHeader>
            {calendarDateDialog && (
              <div className="space-y-4 py-2">
                {calendarDateDialog.myLeaveDetails.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Your leave
                    </p>
                    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                      {calendarDateDialog.myLeaveDetails.map((l, i) => (
                        <div key={i} className="text-sm space-y-1">
                          <p className="font-medium capitalize">{l.leave_type.replace('_', ' ')}</p>
                          <p className="text-muted-foreground text-xs">
                            {new Date(l.start_date).toLocaleDateString()} – {new Date(l.end_date).toLocaleDateString()}
                            {l.number_of_days != null ? ` • ${l.number_of_days} day${l.number_of_days !== 1 ? 's' : ''}` : ''}
                          </p>
                          {l.reason && <p className="text-xs text-muted-foreground line-clamp-2">{l.reason}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {calendarDateDialog.myBusinessTripDetails.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      Your business trip
                    </p>
                    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                      {calendarDateDialog.myBusinessTripDetails.map((t, i) => (
                        <div key={i} className="text-sm space-y-1">
                          <p className="font-medium">{t.trip_type || 'Business trip'}</p>
                          <p className="text-muted-foreground text-xs">{t.destination}</p>
                          <p className="text-muted-foreground text-xs">
                            {new Date(t.start_date).toLocaleDateString()} – {new Date(t.end_date).toLocaleDateString()}
                          </p>
                          {t.purpose && <p className="text-xs text-muted-foreground line-clamp-2">{t.purpose}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(calendarDateDialog.teamLeaveDetails.length > 0 || calendarDateDialog.teamBusinessTripDetails.length > 0) && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team</p>
                    {calendarDateDialog.teamLeaveDetails.length > 0 && (
                      <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                        {calendarDateDialog.teamLeaveDetails.map((l, i) => (
                          <div key={i} className="text-sm space-y-0.5">
                            <p className="font-medium">{l.name}</p>
                            <p className="text-muted-foreground text-xs capitalize">{l.leave_type.replace('_', ' ')}</p>
                            <p className="text-muted-foreground text-xs">
                              {new Date(l.start_date).toLocaleDateString()} – {new Date(l.end_date).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {calendarDateDialog.teamBusinessTripDetails.length > 0 && (
                      <div className="space-y-2 rounded-lg border p-3 bg-muted/30 mt-2">
                        {calendarDateDialog.teamBusinessTripDetails.map((t, i) => (
                          <div key={i} className="text-sm space-y-0.5">
                            <p className="font-medium">{t.name}</p>
                            <p className="text-muted-foreground text-xs">{t.trip_type || 'Business trip'} • {t.destination}</p>
                            <p className="text-muted-foreground text-xs">
                              {new Date(t.start_date).toLocaleDateString()} – {new Date(t.end_date).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {(calendarDateDialog.isMyLeave || calendarDateDialog.teamOnLeave.length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setCalendarDateDialog(null);
                        navigate(currentUser?.roles?.some((r) => ['super_admin', 'admin', 'supervisor', 'manager'].includes(r)) ? '/dashboard/leave?tab=approval' : '/dashboard/leave');
                      }}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Go to Leave
                    </Button>
                  )}
                  {(calendarDateDialog.isMyBusinessTrip || calendarDateDialog.teamOnBusinessTrip.length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setCalendarDateDialog(null);
                        navigate('/dashboard/business-trip');
                      }}
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      Go to Business Trips
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
                        <Badge variant="outline" className={statusVariant[record.status] || ''}>{record.status.replace('_', ' ')}</Badge>
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
