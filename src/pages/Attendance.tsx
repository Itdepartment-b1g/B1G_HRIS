import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Loader2, Eye, ChevronDown, ChevronRight, Pencil, Camera, Filter, MapPin, MoreVertical, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { computeAttendanceStatusFromTimeIn, getWeekdayForDate } from '@/lib/attendanceStatus';
import { exportAttendanceReport } from '@/lib/exportAttendanceReport';
import { timeTo12Hour } from '@/lib/utils';

interface RecordRow {
  id: string;
  date: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  assigned_shift: string;
  assigned_shift_formatted: string; // e.g. "REG 10am to 7pm"
  net_hours: number | null; // net hours from assigned shift (start - end - break)
  time_in: string | null;
  time_out: string | null;
  time_in_photo_url: string | null;
  time_out_photo_url: string | null;
  lat_in: number | null;
  lng_in: number | null;
  lat_out: number | null;
  lng_out: number | null;
  address_in: string | null;
  address_out: string | null;
  notes: string | null;
  remarks: string | null;
  status: string;
  minutes_late: number | null;
  leave_type_code: string | null; // e.g. 'vl', 'sl', 'lwop' — only set when status='on_leave'
  leave_duration_type: 'fullday' | 'first_half' | 'second_half' | null;
  business_trip_id: string | null;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function computeNetWorkingHours(shiftStart: string, shiftEnd: string, breakHours: number): number {
  const startM = parseTimeToMinutes(shiftStart);
  const endM = parseTimeToMinutes(shiftEnd);
  const gross = endM >= startM ? (endM - startM) / 60 : (24 * 60 - startM + endM) / 60;
  const net = Math.max(0, gross - breakHours);
  return Math.round(net * 100) / 100;
}

function computeHalfDayMidpointTime(opts: { start_time: string; end_time: string; break_total_hours?: number }): string {
  const startM = parseTimeToMinutes(opts.start_time.substring(0, 5));
  const endM = parseTimeToMinutes(opts.end_time.substring(0, 5));
  const grossMinutes = endM >= startM ? endM - startM : 24 * 60 - startM + endM;
  const breakMinutes = Math.round((opts.break_total_hours ?? 0) * 60);
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);
  const midMinutes = startM + Math.floor(netMinutes / 2) + breakMinutes;
  const hh = Math.floor((midMinutes % (24 * 60)) / 60)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor(midMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hh}:${mm}:00`;
}

const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'half_day', 'on_leave'] as const;

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format minutes late as decimal hours (total minutes ÷ 60) for the Mins Late column. e.g. 30m → 0.5 */
function formatMinutesLate(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—';
  const decimalHours = minutes / 60;
  return decimalHours % 1 === 0 ? decimalHours.toFixed(1) : decimalHours.toFixed(2);
}

/** Format minutes late as readable time under status (no division). e.g. 30m, 9h 15m */
function formatMinutesLateVisual(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toDateTimeLocal(iso: string | null, dateFallback: string): string {
  if (iso) {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${dateFallback}T08:00`;
}

const Attendance = () => {
  const { user, loading: userLoading } = useCurrentUser();
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewingRecord, setViewingRecord] = useState<RecordRow | null>(null);
  const [editStatusOpen, setEditStatusOpen] = useState(false);
  const [editRemarksOpen, setEditRemarksOpen] = useState(false);
  const [editTimeInOpen, setEditTimeInOpen] = useState(false);
  const [editTimeOutOpen, setEditTimeOutOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordRow | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [page, setPage] = useState(1);
  type MobileFilter = 'all_today' | 'my_30_days' | 'absent';
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>('my_30_days');

  const isAdmin = user?.roles?.includes('super_admin') || user?.roles?.includes('admin');

  // Sync date range when mobile filter changes
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (mobileFilter === 'all_today') {
      setDateFrom(today);
      setDateTo(today);
    } else if (mobileFilter === 'my_30_days' || mobileFilter === 'absent') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(today);
    }
  }, [mobileFilter]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    // Use RPC to ensure admins always see all records (handles RLS edge cases)
    const statusFilter = mobileFilter === 'absent' ? 'absent' : null;
    let data: any[] | null = null;

    const { data: rpcData, error } = await supabase.rpc('get_attendance_records', {
      _date_from: dateFrom,
      _date_to: dateTo,
      _status_filter: statusFilter,
    });

    if (error) {
      // Fallback to direct query if RPC doesn't exist yet (migration not run)
      console.warn('RPC get_attendance_records failed, falling back to direct query:', error.message);
      const restrictToSelf = !userLoading && !isAdmin && user?.id;
      let query = supabase
        .from('attendance_records')
        .select('id, date, time_in, time_out, lat_in, lng_in, lat_out, lng_out, address_in, address_out, notes, remarks, status, minutes_late, time_in_photo_url, time_out_photo_url, leave_type_code, leave_duration_type, employee:employees!employee_id(id, employee_code, first_name, last_name)')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      if (mobileFilter === 'my_30_days' && restrictToSelf) query = query.eq('employee_id', user.id);
      if (mobileFilter === 'all_today' && restrictToSelf) query = query.eq('employee_id', user.id);
      if (mobileFilter === 'absent') query = query.eq('status', 'absent');
      const { data: directData } = await query.order('date', { ascending: false }).order('time_in', { ascending: false });

      // Transform direct query format to match RPC format for unified handling below
      data = (directData || []).map((r: any) => ({
        ...r,
        employee_id: r.employee?.id,
        employee_code: r.employee?.employee_code,
        employee_first_name: r.employee?.first_name,
        employee_last_name: r.employee?.last_name,
      }));
    } else {
      data = rpcData || [];
    }

    // Build shift maps for employees that have records
    const empIds = [...new Set((data as any[]).map((r) => r.employee_id).filter(Boolean))];
    let shiftData: any[] = [];
    if (empIds.length > 0) {
      const { data: sd } = await supabase
        .from('employee_shifts')
        .select('employee_id, shift:shifts(name, start_time, end_time, break_total_hours, days)')
        .in('employee_id', empIds);
      shiftData = sd || [];
    }

    const shiftMap = new Map<string, string[]>();
    const shiftFormattedMap = new Map<string, string>();
    const shiftNetHoursMap = new Map<string, number>();
    const shiftListByEmployee = new Map<
      string,
      Array<{ start_time: string; end_time?: string; break_total_hours?: number; grace_period_minutes?: number; days?: string[] }>
    >();
    shiftData.forEach((s: any) => {
      const sh = s.shift;
      const name = sh?.name || 'REG';
      const list = shiftMap.get(s.employee_id) || [];
      if (!list.includes(name)) list.push(name);
      shiftMap.set(s.employee_id, list);
      if (!shiftFormattedMap.has(s.employee_id) && sh?.start_time && sh?.end_time) {
        shiftFormattedMap.set(s.employee_id, `${name} ${timeTo12Hour(sh.start_time)} to ${timeTo12Hour(sh.end_time)}`);
      }
      if (!shiftNetHoursMap.has(s.employee_id) && sh?.start_time && sh?.end_time) {
        const net = computeNetWorkingHours(
          sh.start_time.substring(0, 5),
          sh.end_time.substring(0, 5),
          sh.break_total_hours ?? 0
        );
        shiftNetHoursMap.set(s.employee_id, net);
      }
      if (sh?.start_time) {
        const arr = shiftListByEmployee.get(s.employee_id) || [];
        arr.push({
          start_time: sh.start_time,
          end_time: sh.end_time,
          break_total_hours: sh.break_total_hours ?? 0,
          grace_period_minutes: sh.grace_period_minutes ?? 0,
          days: sh.days,
        });
        shiftListByEmployee.set(s.employee_id, arr);
      }
    });

    const rows: RecordRow[] = (data as any[]).map((r) => {
      const shifts = shiftMap.get(r.employee_id) || [];
      const formatted = shiftFormattedMap.get(r.employee_id) || shifts.join(', ') || '—';
      const netHours = shiftNetHoursMap.get(r.employee_id) ?? null;
      const employeeName = [r.employee_first_name, r.employee_last_name].filter(Boolean).join(' ') || 'Unknown';

      // Recompute minutes_late from shift start when missing/wrong (null or 0) but time_in exists
      // Use the shift that applies to this record's weekday
      let minutesLate = r.minutes_late ?? null;
      if (r.time_in) {
        const shiftList = shiftListByEmployee.get(r.employee_id) || [];
        const weekday = getWeekdayForDate(r.date);
        const shiftForDay = shiftList.find((s) => !s.days?.length || s.days.includes(weekday)) || shiftList[0];
        // If this day is tagged as HALF-DAY leave, the "working shift start" changes:
        // - first_half  => work starts at midpoint
        // - second_half => work starts at shift start
        const leaveDuration = (r.leave_duration_type as 'fullday' | 'first_half' | 'second_half' | null) || null;
        const isHalfDay = leaveDuration === 'first_half' || leaveDuration === 'second_half';
        const workingStart = isHalfDay && leaveDuration === 'first_half' && shiftForDay?.start_time && shiftForDay?.end_time
          ? computeHalfDayMidpointTime({
              start_time: shiftForDay.start_time,
              end_time: shiftForDay.end_time,
              break_total_hours: shiftForDay.break_total_hours ?? 0,
            })
          : shiftForDay?.start_time;
        const grace = shiftForDay?.grace_period_minutes ?? 0;

        // IMPORTANT: Do not change normal-day logic.
        // For HALF-DAY only, apply grace period to the late counter so that late minutes start AFTER grace.
        if (isHalfDay && workingStart) {
          const timeInM = parseTimeToMinutes(new Date(r.time_in).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));
          const startM = parseTimeToMinutes(workingStart);
          const graceM = Math.max(0, grace);
          const computed = timeInM > startM + graceM ? Math.floor(timeInM - (startM + graceM)) : 0;
          minutesLate = computed > 0 ? computed : null;
        } else if ((minutesLate == null || minutesLate === 0) && workingStart) {
          const { minutesLate: computed } = computeAttendanceStatusFromTimeIn({
            timeInIso: r.time_in,
            date: r.date,
            shift: { start_time: workingStart, grace_period_minutes: 0 },
          });
          minutesLate = computed > 0 ? computed : null;
        }
      }

      return {
        id: r.id,
        date: r.date,
        employee_id: r.employee_id || '',
        employee_code: r.employee_code || '—',
        employee_name: employeeName,
        assigned_shift: shifts.join(', ') || '—',
        assigned_shift_formatted: formatted,
        net_hours: netHours,
        time_in: r.time_in,
        time_out: r.time_out,
        time_in_photo_url: r.time_in_photo_url,
        time_out_photo_url: r.time_out_photo_url,
        lat_in: r.lat_in,
        lng_in: r.lng_in,
        lat_out: r.lat_out,
        lng_out: r.lng_out,
        address_in: r.address_in,
        address_out: r.address_out,
        notes: r.notes,
        remarks: r.remarks,
        status: r.status,
        minutes_late: minutesLate,
        leave_type_code: r.leave_type_code || null,
        leave_duration_type: (r.leave_duration_type as any) || null,
        business_trip_id: r.business_trip_id || null,
      };
    });

    // --- For TODAY only: generate absent rows for employees who haven't clocked in yet ---
    // The pg_cron job handles past dates (runs at end of day for yesterday).
    // Today is still in progress, so we fill the gap on the frontend — lightweight (1 day only).
    const today = new Date().toISOString().slice(0, 10);
    if (isAdmin && dateFrom <= today && dateTo >= today) {
      const todayWeekday = getWeekdayForDate(today);

      // Fetch all active employees
      const { data: allEmployees } = await supabase
        .from('employees')
        .select('id, employee_code, first_name, last_name, login_exempted')
        .eq('is_active', true);

      // Fetch all employee_shifts with shift info
      const { data: allShiftData } = await supabase
        .from('employee_shifts')
        .select('employee_id, shift:shifts(name, start_time, end_time, break_total_hours, days)');

      // Build shift info per employee
      const allShiftsByEmp = new Map<string, Array<{ name: string; start_time: string; end_time: string; break_total_hours: number; days?: string[] }>>();
      (allShiftData || []).forEach((s: any) => {
        const sh = s.shift;
        if (!sh) return;
        const arr = allShiftsByEmp.get(s.employee_id) || [];
        arr.push(sh);
        allShiftsByEmp.set(s.employee_id, arr);
      });

      // Build set of employees who already have a record today
      const existingTodayEmpIds = new Set(
        rows.filter((r) => r.date === today).map((r) => r.employee_id)
      );

      for (const emp of allEmployees || []) {
        if (existingTodayEmpIds.has(emp.id)) continue; // already has a record
        if (emp.login_exempted) continue; // handled by separate cron

        const empShifts = allShiftsByEmp.get(emp.id) || [];
        if (empShifts.length === 0) continue; // no shifts assigned

        const shiftForDay = empShifts.find((s) => !s.days?.length || s.days.includes(todayWeekday));
        if (!shiftForDay) continue; // not scheduled today

        const status = 'absent';

        const shiftNames = [...new Set(empShifts.map((s) => s.name || 'REG'))];
        const formatted = `${shiftForDay.name || 'REG'} ${timeTo12Hour(shiftForDay.start_time)} to ${timeTo12Hour(shiftForDay.end_time)}`;
        const net = computeNetWorkingHours(
          shiftForDay.start_time.substring(0, 5),
          shiftForDay.end_time.substring(0, 5),
          shiftForDay.break_total_hours ?? 0
        );

        rows.push({
          id: `today-absent-${emp.id}`,
          date: today,
          employee_id: emp.id,
          employee_code: emp.employee_code || '—',
          employee_name: [emp.first_name, emp.last_name].filter(Boolean).join(' ') || 'Unknown',
          assigned_shift: shiftNames.join(', '),
          assigned_shift_formatted: formatted,
          net_hours: net,
          time_in: null,
          time_out: null,
          time_in_photo_url: null,
          time_out_photo_url: null,
          lat_in: null,
          lng_in: null,
          lat_out: null,
          lng_out: null,
          address_in: null,
          address_out: null,
          notes: null,
          remarks: null,
          status,
          minutes_late: null,
          leave_type_code: null,
          leave_duration_type: null,
          business_trip_id: null,
        });
      }

      // Re-sort after adding today's absent rows
      rows.sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return a.employee_name.localeCompare(b.employee_name);
      });
    }

    setRecords(rows);
    setLoading(false);
  }, [dateFrom, dateTo, mobileFilter, userLoading, isAdmin, user?.id]);

  useEffect(() => {
    if (!userLoading) fetchRecords();
  }, [fetchRecords, userLoading]);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        r.employee_name.toLowerCase().includes(q) || r.employee_code.toLowerCase().includes(q)
    );
  }, [records, search]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEditStatus = (r: RecordRow) => {
    setEditingRecord(r);
    setEditStatus(r.status);
    setEditStatusOpen(true);
  };

  const openEditRemarks = (r: RecordRow) => {
    setEditingRecord(r);
    setEditRemarks(r.remarks || '');
    setEditRemarksOpen(true);
  };

  const openEditTimeIn = (r: RecordRow) => {
    setEditingRecord(r);
    setEditTimeIn(toDateTimeLocal(r.time_in, r.date));
    setEditTimeInOpen(true);
  };

  const openEditTimeOut = (r: RecordRow) => {
    setEditingRecord(r);
    setEditTimeOut(toDateTimeLocal(r.time_out, r.date));
    setEditTimeOutOpen(true);
  };

  // Today's absent records have no DB row yet — use upsert to create one on first edit
  const isTodayAbsent = (r: RecordRow) => r.id.startsWith('today-absent-');

  const upsertForTodayAbsent = (record: RecordRow, fields: Record<string, any>) =>
    supabase.from('attendance_records').upsert(
      { employee_id: record.employee_id, date: record.date, status: 'absent', ...fields },
      { onConflict: 'employee_id,date' }
    );

  const saveStatus = async () => {
    if (!editingRecord || !isAdmin) return;
    setSaving(true);
    const { error } = isTodayAbsent(editingRecord)
      ? await upsertForTodayAbsent(editingRecord, { status: editStatus })
      : await supabase.from('attendance_records').update({ status: editStatus }).eq('id', editingRecord.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Status updated');
      setEditStatusOpen(false);
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const saveRemarks = async () => {
    if (!editingRecord || !isAdmin) return;
    setSaving(true);
    const { error } = isTodayAbsent(editingRecord)
      ? await upsertForTodayAbsent(editingRecord, { remarks: editRemarks || null })
      : await supabase.from('attendance_records').update({ remarks: editRemarks || null }).eq('id', editingRecord.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Remarks updated');
      setEditRemarksOpen(false);
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const saveTimeIn = async () => {
    if (!editingRecord || !isAdmin) return;
    setSaving(true);
    const ts = editTimeIn ? new Date(editTimeIn).toISOString() : null;
    const date = editingRecord.date;

    // Recompute status based on new time_in vs shift
    const weekday = getWeekdayForDate(date);
    const [shiftRes, empRes] = await Promise.all([
      supabase.from('employee_shifts').select('shift:shifts(start_time, grace_period_minutes, days)').eq('employee_id', editingRecord.employee_id),
      supabase.from('employees').select('late_exempted, grace_period_exempted').eq('id', editingRecord.employee_id).single(),
    ]);
    const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
    const shiftForDay = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
    const shiftInfo = shiftForDay
      ? { start_time: shiftForDay.start_time || '08:00:00', grace_period_minutes: shiftForDay.grace_period_minutes ?? 15, days: shiftForDay.days }
      : null;
    const exemptions = empRes.data ? { late_exempted: empRes.data.late_exempted, grace_period_exempted: empRes.data.grace_period_exempted } : undefined;
    const { status, minutesLate } = computeAttendanceStatusFromTimeIn({ timeInIso: ts, date, shift: shiftInfo, exemptions, currentStoredStatus: editingRecord.status as any });

    const { error } = isTodayAbsent(editingRecord)
      ? await upsertForTodayAbsent(editingRecord, { time_in: ts, status, minutes_late: minutesLate })
      : await supabase.from('attendance_records').update({ time_in: ts, status, minutes_late: minutesLate }).eq('id', editingRecord.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Time in updated${status === 'late' ? ' (status set to Late)' : ''}`);
      setEditTimeInOpen(false);
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const saveTimeOut = async () => {
    if (!editingRecord || !isAdmin) return;
    setSaving(true);
    const ts = editTimeOut ? new Date(editTimeOut).toISOString() : null;

    // If the employee was absent and we're setting a time_out, update status to present
    const shouldUpdateStatus = ts && (editingRecord.status === 'absent' || isTodayAbsent(editingRecord));
    const updateFields: Record<string, any> = { time_out: ts };
    if (shouldUpdateStatus) updateFields.status = 'present';

    const { error } = isTodayAbsent(editingRecord)
      ? await upsertForTodayAbsent(editingRecord, updateFields)
      : await supabase.from('attendance_records').update(updateFields).eq('id', editingRecord.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Time out updated${shouldUpdateStatus ? ' (status set to Present)' : ''}`);
      setEditTimeOutOpen(false);
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExportLoading(true);
    try {
      await exportAttendanceReport({ dateFrom, dateTo, format });
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setExportLoading(false);
    }
  };

  const statusBadge = (
    status: string,
    minutesLate?: number | null,
    opts?: { timeIn?: string | null; timeOut?: string | null; leaveTypeCode?: string | null; leaveDurationType?: 'fullday' | 'first_half' | 'second_half' | null; businessTripId?: string | null }
  ) => {
    const displayStatus = status === 'eti' ? 'present' : status === 'lti' ? 'late' : status; // legacy mapping
    const styles: Record<string, string> = {
      present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      late: 'bg-amber-50 text-amber-700 border-amber-200',
      absent: 'bg-red-50 text-red-700 border-red-200',
      half_day: 'bg-blue-50 text-blue-700 border-blue-200',
      on_leave: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    const lateLabel = minutesLate != null && minutesLate > 0 && (displayStatus === 'present' || displayStatus === 'late')
      ? formatMinutesLateVisual(minutesLate)
      : null;
    const missingTimeOut = opts?.timeIn && !opts?.timeOut && !opts?.businessTripId;
    const leaveDuration = opts?.leaveDurationType;
    const durationLabel =
      leaveDuration === 'first_half' ? '1st half' : leaveDuration === 'second_half' ? '2nd half' : null;
    const isHalfDayLeave = leaveDuration === 'first_half' || leaveDuration === 'second_half';
    const leaveCode = opts?.leaveTypeCode;
    const badgeLabel =
      displayStatus === 'on_leave'
        ? `On Leave${leaveCode ? ` (${leaveCode.toUpperCase()})` : ''}`
        : displayStatus === 'present' && opts?.businessTripId
          ? `Present (Business Trip)`
        : displayStatus === 'present' && isHalfDayLeave
          ? `Present (Half day)${leaveCode ? ` (${leaveCode.toUpperCase()})` : ''}`
          : displayStatus.replace('_', ' ');
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className={styles[displayStatus] || ''}>{badgeLabel}</Badge>
        {displayStatus === 'present' && durationLabel && (
          <span className="text-xs text-muted-foreground">{durationLabel}</span>
        )}
        {lateLabel && lateLabel !== '—' && (
          <span className="text-xs text-muted-foreground">{lateLabel} past shift start</span>
        )}
        {missingTimeOut && (
          <span className="text-xs text-orange-600 flex items-center gap-0.5">
            <AlertCircle className="h-3 w-3" /> No time out
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground"> </h1>
        <p className="text-muted-foreground text-sm mt-1">View daily attendance with geolocation and photo capture</p>
      </div>

      {/* Mobile: Filter tabs + Cards */}
      <div className="block lg:hidden space-y-4">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex gap-2 shrink-0">
              {(['all_today', 'my_30_days', 'absent'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setMobileFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  mobileFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f === 'all_today' ? 'All Today' : f === 'my_30_days' ? 'My Last 30 Days' : 'Absent'}
              </button>
            ))}
            </div>
          </div>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0" disabled={exportLoading}>
                  {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export XLSX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((r) => {
              const hasWarning = r.status === 'absent' || r.status === 'late' || r.status === 'lti';
              return (
                <Card key={r.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate uppercase">{r.employee_name}</span>
                        {hasWarning && (
                          <div className="shrink-0 h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingRecord(r)}>
                            <Eye className="h-4 w-4 mr-2" /> View
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuItem onClick={() => openEditStatus(r)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditRemarks(r)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit remarks
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground mb-4">
                      <div><span className="font-medium text-foreground">Date</span> — {formatDateLong(r.date)}</div>
                      <div><span className="font-medium text-foreground">Shift</span> — {r.assigned_shift_formatted}</div>
                      {r.net_hours != null && <div><span className="font-medium text-foreground">Net Hours</span> — {r.net_hours}h</div>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Start Time</p>
                        <div className="flex flex-col items-center gap-1">
                          {r.time_in_photo_url ? (
                            <a href={r.time_in_photo_url} target="_blank" rel="noopener noreferrer">
                              <img src={r.time_in_photo_url} alt="Time in" className="h-20 w-20 object-cover rounded-full border" />
                            </a>
                          ) : (
                            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-xs text-muted-foreground">No Data</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs">
                            <MapPin className="h-3 w-3" />
                            {r.address_in || formatTime(r.time_in) || '--:--'}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">End Time</p>
                        <div className="flex flex-col items-center gap-1">
                          {r.time_out_photo_url ? (
                            <a href={r.time_out_photo_url} target="_blank" rel="noopener noreferrer">
                              <img src={r.time_out_photo_url} alt="Time out" className="h-20 w-20 object-cover rounded-full border" />
                            </a>
                          ) : (
                            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-xs text-muted-foreground">No Data</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs">
                            <MapPin className="h-3 w-3" />
                            {r.address_out || formatTime(r.time_out) || '--:--'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      {statusBadge(r.status, r.minutes_late, { timeIn: r.time_in, timeOut: r.time_out, leaveTypeCode: r.leave_type_code, leaveDurationType: r.leave_duration_type, businessTripId: r.business_trip_id })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No attendance records found</p>
            )}
          </div>
        )}
      </div>

      {/* Desktop: Search & Date Filter */}
      <div className="hidden lg:flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[140px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[140px]" />
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exportLoading}>
                  {exportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export XLSX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle className="text-base">Attendance ({filtered.length})</CardTitle>
          <p className="text-sm text-muted-foreground">
            From {formatDate(dateFrom)} to {formatDate(dateTo)}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Emp. Code</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Assigned Shift</TableHead>
                    <TableHead>Net Hrs</TableHead>
                    <TableHead>Actual Time In</TableHead>
                    <TableHead>Actual Time Out</TableHead>
                    <TableHead>Mins Late</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((r) => {
                    const isExpanded = expandedIds.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <TableRow className="group">
                          <TableCell className="w-10 p-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleExpand(r.id)}>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell>
                            <TableCell className="font-mono text-sm">{r.employee_code}</TableCell>
                            <TableCell className="font-medium">{r.employee_name}</TableCell>
                            <TableCell className="text-sm">{r.assigned_shift}</TableCell>
                            <TableCell className="font-mono text-sm">{r.net_hours != null ? `${r.net_hours}h` : '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{formatTime(r.time_in) || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{formatTime(r.time_out) || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{formatMinutesLate(r.minutes_late)}</TableCell>
                            <TableCell>
                              {statusBadge(r.status, r.minutes_late, { timeIn: r.time_in, timeOut: r.time_out, leaveTypeCode: r.leave_type_code, leaveDurationType: r.leave_duration_type, businessTripId: r.business_trip_id })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => setViewingRecord(r)} title="View">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => openEditStatus(r)} title="Edit status">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/40">
                              <TableCell colSpan={11} className="py-4">
                                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                      <h4 className="font-semibold text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Time In</h4>
                                      <h4 className="font-semibold text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Time Out</h4>
                                    </div>
                                    {isAdmin && (
                                      <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openEditTimeIn(r)}><Pencil className="h-3 w-3 mr-1" /> Edit In</Button>
                                        <Button variant="outline" size="sm" onClick={() => openEditTimeOut(r)}><Pencil className="h-3 w-3 mr-1" /> Edit Out</Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div><span className="text-muted-foreground text-xs">Actual Time</span><p className="font-mono">{formatTime(r.time_in) || '—'}</p></div>
                                    <div><span className="text-muted-foreground text-xs">Lat/Lng</span><p className="font-mono text-xs truncate" title={r.lat_in != null ? `${r.lat_in}, ${r.lng_in}` : undefined}>{r.lat_in != null ? `${r.lat_in.toFixed(6)}, ${r.lng_in?.toFixed(6)}` : '—'}</p></div>
                                    <div><span className="text-muted-foreground text-xs">Actual Time</span><p className="font-mono">{formatTime(r.time_out) || '—'}</p></div>
                                    <div><span className="text-muted-foreground text-xs">Lat/Lng</span><p className="font-mono text-xs truncate" title={r.lat_out != null ? `${r.lat_out}, ${r.lng_out}` : undefined}>{r.lat_out != null ? `${r.lat_out.toFixed(6)}, ${r.lng_out?.toFixed(6)}` : '—'}</p></div>
                                  </div>
                                  <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div className="flex flex-col gap-1 col-span-2">
                                      <span className="text-muted-foreground text-xs">Photo</span>
                                      {r.time_in_photo_url ? (
                                        <a href={r.time_in_photo_url} target="_blank" rel="noopener noreferrer" className="w-fit">
                                          <img src={r.time_in_photo_url} alt="Time in" className="h-36 w-36 object-cover rounded-md border cursor-pointer block" />
                                        </a>
                                      ) : <p className="text-sm">—</p>}
                                    </div>
                                    <div className="flex flex-col gap-1 col-span-2">
                                      <span className="text-muted-foreground text-xs">Photo</span>
                                      {r.time_out_photo_url ? (
                                        <a href={r.time_out_photo_url} target="_blank" rel="noopener noreferrer" className="w-fit">
                                          <img src={r.time_out_photo_url} alt="Time out" className="h-36 w-36 object-cover rounded-md border cursor-pointer block" />
                                        </a>
                                      ) : <p className="text-sm">—</p>}
                                    </div>
                                  </div>
                                </div>
                                {isAdmin && (
                                  <div className="mt-4 pl-4 border-l-2 border-amber-200">
                                    <h4 className="font-semibold text-sm mb-2">Remarks</h4>
                                    <p className="text-sm text-muted-foreground mb-2">{r.remarks || '—'}</p>
                                    <Button variant="outline" size="sm" onClick={() => openEditRemarks(r)}>
                                      <Pencil className="h-3 w-3 mr-1" /> Edit remarks
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No attendance records found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {!loading && filtered.length > 0 && (
                <TablePagination totalItems={filtered.length} currentPage={page} onPageChange={setPage} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewingRecord} onOpenChange={(open) => { if (!open) setViewingRecord(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Attendance Details
            </DialogTitle>
            <DialogDescription>
              {viewingRecord && `${viewingRecord.employee_name} (${viewingRecord.employee_code}) — ${formatDate(viewingRecord.date)}`}
            </DialogDescription>
          </DialogHeader>
          {viewingRecord && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground text-sm">Date</span><p className="font-medium">{formatDate(viewingRecord.date)}</p></div>
                <div><span className="text-muted-foreground text-sm">Employee Code</span><p className="font-mono">{viewingRecord.employee_code}</p></div>
                <div><span className="text-muted-foreground text-sm">Employee</span><p className="font-medium">{viewingRecord.employee_name}</p></div>
                <div><span className="text-muted-foreground text-sm">Assigned Shift</span><p>{viewingRecord.assigned_shift}</p></div>
                <div><span className="text-muted-foreground text-sm">Net Hours (from shift)</span><p className="font-mono">{viewingRecord.net_hours != null ? `${viewingRecord.net_hours}h` : '—'}</p></div>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center justify-between">
                  <span>Time In / Time Out</span>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setViewingRecord(null); openEditTimeIn(viewingRecord); }}><Pencil className="h-3 w-3 mr-1" /> Edit In</Button>
                      <Button variant="outline" size="sm" onClick={() => { setViewingRecord(null); openEditTimeOut(viewingRecord); }}><Pencil className="h-3 w-3 mr-1" /> Edit Out</Button>
                    </div>
                  )}
                </h4>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground text-xs">Actual Time</span><p className="font-mono">{formatTime(viewingRecord.time_in) || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Lat/Lng</span><p className="font-mono text-xs truncate" title={viewingRecord.lat_in != null ? `${viewingRecord.lat_in}, ${viewingRecord.lng_in}` : undefined}>{viewingRecord.lat_in != null ? `${viewingRecord.lat_in.toFixed(6)}, ${viewingRecord.lng_in?.toFixed(6)}` : '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Actual Time</span><p className="font-mono">{formatTime(viewingRecord.time_out) || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Lat/Lng</span><p className="font-mono text-xs truncate" title={viewingRecord.lat_out != null ? `${viewingRecord.lat_out}, ${viewingRecord.lng_out}` : undefined}>{viewingRecord.lat_out != null ? `${viewingRecord.lat_out.toFixed(6)}, ${viewingRecord.lng_out?.toFixed(6)}` : '—'}</p></div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm mt-3">
                  <div className="flex flex-col gap-1 col-span-2">
                    <span className="text-muted-foreground text-xs">Photo</span>
                    {viewingRecord.time_in_photo_url ? (
                      <a href={viewingRecord.time_in_photo_url} target="_blank" rel="noopener noreferrer" className="w-fit">
                        <img src={viewingRecord.time_in_photo_url} alt="Time in" className="h-48 w-48 object-cover rounded-md border cursor-pointer block" />
                      </a>
                    ) : <p>—</p>}
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <span className="text-muted-foreground text-xs">Photo</span>
                    {viewingRecord.time_out_photo_url ? (
                      <a href={viewingRecord.time_out_photo_url} target="_blank" rel="noopener noreferrer" className="w-fit">
                        <img src={viewingRecord.time_out_photo_url} alt="Time out" className="h-48 w-48 object-cover rounded-md border cursor-pointer block" />
                      </a>
                    ) : <p>—</p>}
                  </div>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Attendance Status</span>
                 <div className="mt-1">{statusBadge(viewingRecord.status, viewingRecord.minutes_late, { timeIn: viewingRecord.time_in, timeOut: viewingRecord.time_out, leaveTypeCode: viewingRecord.leave_type_code, leaveDurationType: viewingRecord.leave_duration_type, businessTripId: viewingRecord.business_trip_id })}</div>
                {isAdmin && <Button variant="outline" size="sm" className="mt-2" onClick={() => { setViewingRecord(null); openEditStatus(viewingRecord); }}><Pencil className="h-3 w-3 mr-1" /> Edit status</Button>}
              </div>
              {(viewingRecord.remarks || isAdmin) && (
                <div>
                  <span className="text-muted-foreground text-sm">Remarks</span>
                  <p className="mt-1 text-sm">{viewingRecord.remarks || '—'}</p>
                  {isAdmin && <Button variant="outline" size="sm" className="mt-2" onClick={() => { setViewingRecord(null); openEditRemarks(viewingRecord); }}><Pencil className="h-3 w-3 mr-1" /> Edit remarks</Button>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingRecord(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Status Dialog */}
      <Dialog open={editStatusOpen} onOpenChange={setEditStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance Status</DialogTitle>
            <DialogDescription>Change the attendance status for admin records.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTENDANCE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStatusOpen(false)}>Cancel</Button>
            <Button onClick={saveStatus} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Remarks Dialog */}
      <Dialog open={editRemarksOpen} onOpenChange={setEditRemarksOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Remarks</DialogTitle>
            <DialogDescription>Add or update remarks for this attendance record. Visible to super admin and admin only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} placeholder="Optional remarks..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRemarksOpen(false)}>Cancel</Button>
            <Button onClick={saveRemarks} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Time In Dialog */}
      <Dialog open={editTimeInOpen} onOpenChange={setEditTimeInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time In</DialogTitle>
            <DialogDescription>Change the time in for this attendance record. Super admin and admin only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Date & Time</Label>
            <Input type="datetime-local" value={editTimeIn} onChange={(e) => setEditTimeIn(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTimeInOpen(false)}>Cancel</Button>
            <Button onClick={saveTimeIn} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Time Out Dialog */}
      <Dialog open={editTimeOutOpen} onOpenChange={setEditTimeOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Out</DialogTitle>
            <DialogDescription>Change the time out for this attendance record. Super admin and admin only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Date & Time</Label>
            <Input type="datetime-local" value={editTimeOut} onChange={(e) => setEditTimeOut(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTimeOutOpen(false)}>Cancel</Button>
            <Button onClick={saveTimeOut} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
