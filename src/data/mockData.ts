// Hardcoded data for the HRIS system
// Replace with Supabase queries when connecting to backend

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee';

export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  department: string;
  position: string;
  avatar_url?: string;
  supervisor_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  lat_in: number | null;
  lng_in: number | null;
  lat_out: number | null;
  lng_out: number | null;
  status: 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';
  notes?: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  created_at: string;
  is_pinned: boolean;
}

// Current logged in user
export const currentUser: Employee = {
  id: '1',
  employee_code: 'EMP-001',
  first_name: 'Maria',
  last_name: 'Santos',
  email: 'maria.santos@b1g.com',
  role: 'super_admin',
  department: 'Human Resources',
  position: 'HR Director',
  is_active: true,
  created_at: '2023-01-15',
};

export const employees: Employee[] = [
  currentUser,
  { id: '2', employee_code: 'EMP-002', first_name: 'Juan', last_name: 'Dela Cruz', email: 'juan.delacruz@b1g.com', role: 'admin', department: 'Human Resources', position: 'HR Manager', is_active: true, created_at: '2023-02-01' },
  { id: '3', employee_code: 'EMP-003', first_name: 'Ana', last_name: 'Reyes', email: 'ana.reyes@b1g.com', role: 'supervisor', department: 'Engineering', position: 'Engineering Lead', supervisor_id: '1', is_active: true, created_at: '2023-03-10' },
  { id: '4', employee_code: 'EMP-004', first_name: 'Carlos', last_name: 'Garcia', email: 'carlos.garcia@b1g.com', role: 'employee', department: 'Engineering', position: 'Software Developer', supervisor_id: '3', is_active: true, created_at: '2023-04-20' },
  { id: '5', employee_code: 'EMP-005', first_name: 'Liza', last_name: 'Mendoza', email: 'liza.mendoza@b1g.com', role: 'employee', department: 'Marketing', position: 'Marketing Specialist', supervisor_id: '3', is_active: true, created_at: '2023-05-15' },
  { id: '6', employee_code: 'EMP-006', first_name: 'Marco', last_name: 'Tan', email: 'marco.tan@b1g.com', role: 'employee', department: 'Sales', position: 'Sales Representative', supervisor_id: '2', is_active: true, created_at: '2023-06-01' },
  { id: '7', employee_code: 'EMP-007', first_name: 'Patricia', last_name: 'Lim', email: 'patricia.lim@b1g.com', role: 'employee', department: 'Finance', position: 'Accountant', supervisor_id: '2', is_active: false, created_at: '2023-07-10' },
  { id: '8', employee_code: 'EMP-008', first_name: 'Ricardo', last_name: 'Bautista', email: 'ricardo.bautista@b1g.com', role: 'supervisor', department: 'Operations', position: 'Operations Manager', supervisor_id: '1', is_active: true, created_at: '2023-08-20' },
];

export const attendanceRecords: AttendanceRecord[] = [
  { id: '1', employee_id: '4', employee_name: 'Carlos Garcia', date: '2026-03-04', time_in: '08:02', time_out: '17:05', lat_in: 14.5995, lng_in: 120.9842, lat_out: 14.5995, lng_out: 120.9842, status: 'present' },
  { id: '2', employee_id: '5', employee_name: 'Liza Mendoza', date: '2026-03-04', time_in: '08:35', time_out: '17:00', lat_in: 14.5995, lng_in: 120.9842, lat_out: 14.5995, lng_out: 120.9842, status: 'late' },
  { id: '3', employee_id: '6', employee_name: 'Marco Tan', date: '2026-03-04', time_in: null, time_out: null, lat_in: null, lng_in: null, lat_out: null, lng_out: null, status: 'absent' },
  { id: '4', employee_id: '3', employee_name: 'Ana Reyes', date: '2026-03-04', time_in: '07:55', time_out: '17:10', lat_in: 14.5995, lng_in: 120.9842, lat_out: 14.5995, lng_out: 120.9842, status: 'present' },
  { id: '5', employee_id: '8', employee_name: 'Ricardo Bautista', date: '2026-03-04', time_in: '08:00', time_out: null, lat_in: 14.5995, lng_in: 120.9842, lat_out: null, lng_out: null, status: 'present' },
  { id: '6', employee_id: '2', employee_name: 'Juan Dela Cruz', date: '2026-03-04', time_in: '07:50', time_out: '17:00', lat_in: 14.5995, lng_in: 120.9842, lat_out: 14.5995, lng_out: 120.9842, status: 'present' },
];

export const leaveRequests: LeaveRequest[] = [
  { id: '1', employee_id: '5', employee_name: 'Liza Mendoza', leave_type: 'vacation', start_date: '2026-03-10', end_date: '2026-03-14', status: 'pending', reason: 'Family vacation' },
  { id: '2', employee_id: '6', employee_name: 'Marco Tan', leave_type: 'sick', start_date: '2026-03-04', end_date: '2026-03-04', status: 'approved', reason: 'Not feeling well' },
  { id: '3', employee_id: '4', employee_name: 'Carlos Garcia', leave_type: 'personal', start_date: '2026-03-20', end_date: '2026-03-21', status: 'pending', reason: 'Personal matters' },
];

export const announcements: Announcement[] = [
  { id: '1', title: 'Company Outing 2026', content: 'Annual company outing scheduled for April 15-16. Please confirm attendance by March 20.', author: 'Maria Santos', created_at: '2026-03-01', is_pinned: true },
  { id: '2', title: 'New Leave Policy', content: 'Updated leave policy effective March 1, 2026. Please review the memo sent to your email.', author: 'Juan Dela Cruz', created_at: '2026-02-28', is_pinned: false },
  { id: '3', title: 'System Maintenance', content: 'HRIS will undergo maintenance on March 8, from 10PM to 2AM.', author: 'Maria Santos', created_at: '2026-03-02', is_pinned: false },
];

export const departmentStats = {
  totalEmployees: 8,
  activeToday: 5,
  onLeave: 1,
  absent: 1,
  late: 1,
};
