// Shared types aligned with Supabase schema

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee';

export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  avatar_url?: string | null;
  supervisor_id?: string | null;
  shift_id?: string | null;
  is_active: boolean;
  hired_date?: string | null;
  created_at: string;
  updated_at?: string;
  role?: UserRole;
  user_roles?: { role: string }[];
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  lat_in: number | null;
  lng_in: number | null;
  lat_out: number | null;
  lng_out: number | null;
  status: 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';
  notes?: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  leave_type: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id?: string;
  author?: string;
  created_at: string;
  updated_at?: string;
  is_pinned: boolean;
}
