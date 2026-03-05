import ComingSoon from '@/components/ComingSoon';
import {
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
  Building2,
  BarChart3,
} from 'lucide-react';

// Time Attendance
export const Overtime = () => (
  <ComingSoon title="Overtime" description="Manage overtime requests and approvals." icon={Timer} />
);
export const BusinessTrip = () => (
  <ComingSoon title="Business Trip" description="Track and manage business travel requests." icon={Briefcase} />
);
export const Correction = () => (
  <ComingSoon title="Attendance Correction" description="Submit and review attendance corrections." icon={FileEdit} />
);

// Core
export const SettingsPage = () => (
  <ComingSoon title="Company" description="Company settings and configuration." icon={Building2} />
);

// Activity
export const Announcements = () => (
  <ComingSoon title="Announcements" description="Company announcements and updates." icon={MessageCircle} />
);
export const TaskFeedback = () => (
  <ComingSoon title="Task & Feedback" description="Employee task assignments and feedback details." icon={ClipboardList} />
);
export const DailyActivity = () => (
  <ComingSoon title="Daily Activity" description="Track employee daily activities and logs." icon={ListChecks} />
);
export const EventScheduling = () => (
  <ComingSoon title="Event & Scheduling" description="Company events and schedule management." icon={CalendarDays} />
);
export const EmployeeSurvey = () => (
  <ComingSoon title="Employee Survey" description="Collect and manage employee survey responses." icon={ClipboardCheck} />
);

// Finance
export const Reports = () => (
  <ComingSoon title="Claim" description="Submit and track expense claims." icon={FileText} />
);
export const MyPayslip = () => (
  <ComingSoon title="My Payslip" description="View and download your payslips." icon={Banknote} />
);
