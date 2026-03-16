import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import MasterDataLayout from "./components/MasterDataLayout";
import CompanyLayout from "./components/CompanyLayout";
import { RequireRole } from "./components/RequireRole";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Employees from "./pages/Employees";
import Leave from "./pages/Leave";
import MyLeaveBalance from "./pages/MyLeaveBalance";
import Overtime from "./pages/Overtime";
import BusinessTrip from "./pages/BusinessTrip";
import SurveyPage from "./pages/activity/SurveyPage";
import AnnouncementsPage from "./pages/activity/AnnouncementsPage";
import PoliciesPage from "./pages/activity/PoliciesPage";
import SurveyAnalyticsPage from "./pages/activity/SurveyAnalyticsPage";
import {
  Correction,
  TaskFeedback,
  DailyActivity,
  EventScheduling,
  Reports,
  MyPayslip,
} from "./pages/PlaceholderPages";
import Settings from "./pages/Settings";
import Departments from "./pages/Departments";
import OrgStructure from "./pages/OrgStructure";
import CompanyProfile from "./pages/CompanyProfile";
import Shifts from "./pages/Shifts";
import EmploymentStatus from "./pages/EmploymentStatus";
import WorkLocations from "./pages/WorkLocations";
import Holidays from "./pages/Holidays";
import Positions from "./pages/Positions";
import CostCenters from "./pages/CostCenters";
import LeaveBalances from "./pages/LeaveBalances";
import PersonalData from "./pages/employee/PersonalData";
import EmployeeRequests from "./pages/employee/EmployeeRequests";
import FeaturesPage from "./pages/mobile/FeaturesPage";
import FeedsPage from "./pages/mobile/FeedsPage";
import WorkspacePage from "./pages/mobile/WorkspacePage";
import TeammatesPage from "./pages/mobile/TeammatesPage";
import TasksPage from "./pages/mobile/TasksPage";
import BirthdaysPage from "./pages/mobile/BirthdaysPage";
import ProfilePage from "./pages/mobile/ProfilePage";
import TimeInOutPage from "./pages/TimeInOutPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="leave" element={<Leave />} />
            <Route path="leave-balance" element={<MyLeaveBalance />} />
            <Route path="overtime" element={<Overtime />} />
            <Route path="business-trip" element={<BusinessTrip />} />
            <Route path="correction" element={<Correction />} />
            <Route path="task-feedback" element={<TaskFeedback />} />
            <Route path="daily-activity" element={<DailyActivity />} />
            <Route path="activity" element={<Navigate to="/dashboard/activity/survey" replace />} />
            <Route path="activity/survey" element={<SurveyPage />} />
            <Route path="activity/announcements" element={<AnnouncementsPage />} />
            <Route path="activity/policies" element={<PoliciesPage />} />
            <Route path="activity/survey-analytics" element={<RequireRole roles={['admin', 'super_admin']}><SurveyAnalyticsPage /></RequireRole>} />
            <Route path="chat" element={<Navigate to="/dashboard/activity/announcements" replace />} />
            <Route path="announcements" element={<Navigate to="/dashboard/activity/announcements" replace />} />
            <Route path="events" element={<EventScheduling />} />
            <Route path="survey" element={<Navigate to="/dashboard/activity/survey" replace />} />
            <Route path="claims" element={<Reports />} />
            <Route path="payslip" element={<MyPayslip />} />
            <Route path="employees" element={<RequireRole roles={['admin', 'super_admin']}><Employees /></RequireRole>} />
            <Route path="departments" element={<RequireRole roles={['admin', 'super_admin']}><Departments /></RequireRole>} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="master-data" element={<RequireRole roles={['admin', 'super_admin']}><MasterDataLayout /></RequireRole>}>
              <Route index element={<Navigate to="employees" replace />} />
              <Route path="employees" element={<Employees />} />
              <Route path="departments" element={<Departments />} />
              <Route path="org-structure" element={<OrgStructure />} />
              <Route path="employment-status" element={<EmploymentStatus />} />
              <Route path="positions" element={<Positions />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="work-locations" element={<WorkLocations />} />
              <Route path="holidays" element={<Holidays />} />
              <Route path="leave-balances" element={<LeaveBalances />} />
              <Route path="cost-centers" element={<CostCenters />} />
            </Route>
            <Route path="employee" element={<EmployeeLayout />}>
              <Route index element={<Navigate to="personal-data" replace />} />
              <Route path="personal-data" element={<PersonalData />} />
              <Route path="requests" element={<EmployeeRequests />} />
            </Route>
            <Route path="company" element={<CompanyLayout />}>
              <Route index element={<Navigate to="org-structure" replace />} />
              <Route path="org-structure" element={<OrgStructure />} />
              <Route path="profile" element={<CompanyProfile />} />
            </Route>
            <Route path="settings" element={<Settings />} />
            <Route path="features" element={<FeaturesPage />} />
            <Route path="feeds" element={<FeedsPage />} />
            <Route path="workspace" element={<WorkspacePage />} />
            <Route path="teammates" element={<TeammatesPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="birthdays" element={<BirthdaysPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="time-in-out" element={<TimeInOutPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
