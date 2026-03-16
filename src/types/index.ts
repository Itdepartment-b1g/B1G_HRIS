// Shared types aligned with Supabase schema

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee' | 'intern' | 'manager' | 'executive';

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
  employment_status_id?: string | null;
  employment_status?: { name: string; is_regular: boolean };
  is_active: boolean;
  hired_date?: string | null;
  login_exempted?: boolean;
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

export type LeaveType = 'vl' | 'sl' | 'pto' | 'lwop' | 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity';
export type LeaveDurationType = 'fullday' | 'first_half' | 'second_half';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  leave_duration_type?: LeaveDurationType;
  number_of_days?: number | null;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  attachment_url?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  approver_name?: string | null;
}

export interface LeaveBalance {
  employee_id: string;
  year: number;
  vl_balance: number;
  sl_balance: number;
  pto_balance: number;
  lwop_days_used: number;
  balances?: Record<string, number>;
}

export interface LeaveTypeConfigForBalance {
  code: string;
  name: string;
  annual_entitlement: number;
  cap: number | null;
  is_system: boolean;
}

export type TripType = 'work_visit_domestic' | 'work_visit_overseas' | 'training';

export interface BusinessTrip {
  id: string;
  employee_id: string;
  trip_type?: TripType | null;
  destination: string;
  purpose: string | null;
  start_date: string;
  end_date: string;
  attachment_url: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  approved_by?: string | null;
  approved_at?: string | null;
  approver_name?: string | null;
  employee_name?: string;
}

export interface OvertimeRequest {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  hours: number | null;
  reason: string | null;
  attachment_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string | null;
  approved_at?: string | null;
  approver_name?: string | null;
  employee_name?: string;
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
  publish_date?: string;
  expiration_date?: string | null;
  attachment_url?: string | null;
  target_audience?: string;
  target_employee_ids?: string[];
}

export interface AnnouncementAcknowledgement {
  id: string;
  announcement_id: string;
  employee_id: string;
  acknowledged_at: string;
}

export type SurveyAnswerType = 'multiple_choice' | 'rating' | 'text';

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  target_audience: string;
  target_employee_ids: string[];
  is_anonymous: boolean;
  author_id: string;
  created_at: string;
  updated_at?: string;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  sort_order: number;
  question_text: string;
  answer_type: SurveyAnswerType;
  options: string[];
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  employee_id: string | null;
  responded_at: string;
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
  answer_rating: number | null;
  answer_choice: string | null;
}

export interface Policy {
  id: string;
  title: string;
  description: string;
  effective_date: string;
  attachment_url: string | null;
  target_audience: string;
  target_employee_ids: string[];
  author_id: string;
  created_at: string;
  updated_at?: string;
}

export interface PolicyAcknowledgement {
  id: string;
  policy_id: string;
  employee_id: string;
  acknowledged_at: string;
}
