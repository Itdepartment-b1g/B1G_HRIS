import {
  Building2,
  Users,
  Clock,
  Calendar,
  Timer,
  Briefcase,
  FileEdit,
  ClipboardList,
  ListChecks,
  MessageCircle,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Banknote,
  Network,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  description?: string;
  iconBg?: string;
  iconColor?: string;
  icon: LucideIcon;
}

export interface NavDropdown {
  label: string;
  items: NavItem[];
  grid?: boolean;
}

export const navDropdowns: NavDropdown[] = [
  {
    label: 'Core',
    grid: false,
    items: [
      { label: 'Company', path: '/dashboard/company', description: 'Company related data', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', icon: Building2 },
      { label: 'Employee', path: '/dashboard/employee/personal-data', description: 'Employee related data', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: Users },
      { label: 'Master Data Setting', path: '/dashboard/master-data/employees', description: 'Employees, departments & shifts', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: Settings },
    ],
  },
  {
    label: 'Time Attendance',
    items: [
      { label: 'Attendance', path: '/dashboard/attendance', description: 'Attendance related data', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: Clock },
      { label: 'Leave', path: '/dashboard/leave', description: 'Leave related data', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', icon: Calendar },
      { label: 'Overtime', path: '/dashboard/overtime', description: 'Overtime related data', iconBg: 'bg-sky-100', iconColor: 'text-sky-600', icon: Timer },
      { label: 'Business Trip', path: '/dashboard/business-trip', description: 'Business trip related data', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', icon: Briefcase },
      { label: 'Attendance Correction', path: '/dashboard/correction', description: 'Correction related data', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', icon: FileEdit },
    ],
  },
  {
    label: 'Activity',
    items: [
      { label: 'Task & Feedback', path: '/dashboard/task-feedback', description: 'Employee task & feedback details', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: ClipboardList },
      { label: 'Daily Activity', path: '/dashboard/daily-activity', description: 'Track employee daily activities', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: ListChecks },
      { label: 'Chat', path: '/dashboard/chat', description: 'Internal communication tools', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: MessageCircle },
      { label: 'Event & Scheduling', path: '/dashboard/events', description: 'Company event & schedule', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: CalendarDays },
      { label: 'Employee Survey', path: '/dashboard/survey', description: 'Collecting employee survey responses', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Claim', path: '/dashboard/claims', description: 'Claims related data', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: FileText },
      { label: 'My Payslip', path: '/dashboard/payslip', description: 'Access my payslip', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: Banknote },
    ],
  },
];
