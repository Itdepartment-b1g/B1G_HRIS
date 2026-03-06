import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import MasterDataLayout from "./components/MasterDataLayout";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Employees from "./pages/Employees";
import {
  Overtime,
  BusinessTrip,
  Correction,
  Announcements,
  TaskFeedback,
  DailyActivity,
  EventScheduling,
  EmployeeSurvey,
  Reports,
  MyPayslip,
  SettingsPage,
} from "./pages/PlaceholderPages";
import Settings from "./pages/Settings";
import Departments from "./pages/Departments";
import Shifts from "./pages/Shifts";
import EmploymentStatus from "./pages/EmploymentStatus";
import WorkLocations from "./pages/WorkLocations";
import Holidays from "./pages/Holidays";
import Positions from "./pages/Positions";
import CostCenters from "./pages/CostCenters";
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
            <Route path="overtime" element={<Overtime />} />
            <Route path="business-trip" element={<BusinessTrip />} />
            <Route path="correction" element={<Correction />} />
            <Route path="task-feedback" element={<TaskFeedback />} />
            <Route path="daily-activity" element={<DailyActivity />} />
            <Route path="chat" element={<Announcements />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="events" element={<EventScheduling />} />
            <Route path="survey" element={<EmployeeSurvey />} />
            <Route path="claims" element={<Reports />} />
            <Route path="payslip" element={<MyPayslip />} />
            <Route path="employees" element={<Employees />} />
            <Route path="departments" element={<Departments />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="master-data" element={<MasterDataLayout />}>
              <Route index element={<Navigate to="employees" replace />} />
              <Route path="employees" element={<Employees />} />
              <Route path="departments" element={<Departments />} />
              <Route path="employment-status" element={<EmploymentStatus />} />
              <Route path="positions" element={<Positions />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="work-locations" element={<WorkLocations />} />
              <Route path="holidays" element={<Holidays />} />
              <Route path="cost-centers" element={<CostCenters />} />
            </Route>
            <Route path="employee" element={<EmployeeLayout />}>
              <Route index element={<Navigate to="personal-data" replace />} />
              <Route path="personal-data" element={<PersonalData />} />
              <Route path="requests" element={<EmployeeRequests />} />
            </Route>
            <Route path="company" element={<SettingsPage />} />
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
