import {
  Building2,
  Users,
  Clock,
  Calendar,
  ClipboardList,
  Timer,
  Briefcase,
  MessageCircle,
  FileText,
  Banknote,
  BarChart3,
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
  /** When set, only these roles can see this item. Omit for all roles. */
  roles?: string[];
}

export interface NavDropdown {
  label: string;
  items: NavItem[];
  grid?: boolean;
  hidden?: boolean;
}

export const navDropdowns: NavDropdown[] = [
  {
    label: 'Core',
    grid: false,
    items: [
      { label: 'Company', path: '/dashboard/company', description: 'Company related data', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', icon: Building2 },
      { label: 'Employee', path: '/dashboard/employee/personal-data', description: 'Employee related data', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: Users },
      { label: 'Master Data Setting', path: '/dashboard/master-data/employees', description: 'Employees, departments & shifts', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: Settings, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    label: 'Time Attendance',
    items: [
      { label: 'Attendance', path: '/dashboard/attendance', description: 'Attendance related data', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: Clock },
      { label: 'Leave', path: '/dashboard/leave', description: 'Leave and approvals', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', icon: Calendar },
      { label: 'Overtime', path: '/dashboard/overtime', description: 'Overtime and approvals', iconBg: 'bg-sky-100', iconColor: 'text-sky-600', icon: Timer },
      { label: 'Business Trip', path: '/dashboard/business-trip', description: 'Business trip related data', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', icon: Briefcase },
    ],
  },
  {
    label: 'Activity',
    items: [
      { label: 'Employee Survey', path: '/dashboard/activity/survey', description: 'Surveys and feedback', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: ClipboardList },
      { label: 'Announcements', path: '/dashboard/activity/announcements', description: 'Company announcements and updates', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: MessageCircle },
      { label: 'Policy Updates', path: '/dashboard/activity/policies', description: 'Company policies', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: FileText },
      { label: 'Survey Analytics', path: '/dashboard/activity/survey-analytics', description: 'View survey responses and analytics', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', icon: BarChart3, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    label: 'Finance',
    hidden: true,
    items: [
      { label: 'Claim', path: '/dashboard/claims', description: 'Claims related data', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: FileText },
      { label: 'My Payslip', path: '/dashboard/payslip', description: 'Access my payslip', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: Banknote },
    ],
  },
];
