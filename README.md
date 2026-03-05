# B1G HRIS — Human Resource Information System

A modern, full-featured HRIS built with React, TypeScript, and Supabase. Designed for managing employees, attendance, leave, shifts, departments, and more — with role-based access and a responsive mobile experience.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, Shadcn UI (Radix primitives), Lucide icons
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Row Level Security)
- **Data Fetching:** @tanstack/react-query, @supabase/supabase-js
- **Forms:** react-hook-form, Zod validation
- **Routing:** react-router-dom v6
- **Charts:** Recharts
- **Notifications:** Sonner toast

## Features

### Core HR

- **Employee Management** — Full CRUD (add, edit, delete) with role assignment, shift assignment, supervisor assignment, and department selection. Connected to Supabase with auth user creation via Edge Functions.
- **Department Management** — Create, edit, and delete departments. Assign a head/manager (supervisor or admin) to each department. View employee counts per department.
- **Shift Management** — Define work shifts with name, start time, end time, and description. Assign shifts to employees. Toggle active/inactive status.

### Time & Attendance

- **Attendance Tracking** — Geolocation-powered clock in/out with map coordinates. View attendance log via dialog.
- **Leave Requests** — Submit and manage vacation, sick, personal, maternity, and paternity leave.
- **Overtime Requests** — Submit overtime with date, start/end time, and approval workflow.
- **Business Trips** — Track travel requests with destination, purpose, and approval status.
- **Attendance Corrections** — Submit corrections for attendance records with approval chain.

### Activity

- Task & Feedback tracking
- Daily Activity logging
- Internal Chat / Announcements
- Event & Scheduling
- Employee Surveys (Polling & Survey tabs)

### Finance

- Claims management
- Payslip access

### Dashboard

- Attendance card with clock in/out, shift display, and attendance log dialog
- Today's Teammates with supervisor and co-worker display
- All Feeds section with leave/overtime/announcement activity
- Employee Survey widget
- Today's Task tracker
- Company Information card

### Mobile Experience

- Dedicated bottom navigation bar (Home, Features, Feeds, Workspace, Profile)
- Features page showcasing all navigation items from the desktop top bar
- Workspace page consolidating Today's Tasks, Employee Birthdays, and Surveys
- Top navigation bar hidden on mobile for clean layout

### Role-Based Access

- **Super Admin** — Full system access, can create all roles
- **Admin** — Employee and department management, can create employees and supervisors
- **Supervisor/Manager** — Team management, approval workflows
- **Employee** — Self-service attendance, leave, profile

## Database Schema

| Table | Purpose |
|-------|---------|
| `company_profile` | Company settings, work hours, timezone |
| `employees` | Employee profiles (linked to `auth.users`) |
| `user_roles` | Role assignments per user |
| `shifts` | Shift definitions (name, start/end time) |
| `departments` | Department hierarchy with head assignment |
| `attendance_records` | Daily attendance with geolocation |
| `leave_requests` | Leave requests and approvals |
| `overtime_requests` | Overtime tracking |
| `business_trips` | Business travel requests |
| `attendance_corrections` | Attendance correction requests |
| `announcements` | Company-wide announcements |

All tables use Row Level Security (RLS) with role-based policies.

## Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `create-user` | Create auth user + employee profile + role assignment |
| `delete-user` | Delete auth user (cascades to employee/roles) |
| `reset-password` | Reset user password via admin API |
| `update-user-profile` | Update employee profile and auth metadata |
| `seed-database` | Populate database with sample data |

## Project Structure

```
src/
├── components/
│   ├── ui/                    # Shadcn UI components
│   ├── DashboardLayout.tsx    # Main layout with top nav
│   └── MobileBottomNav.tsx    # Mobile bottom navigation
├── data/
│   └── mockData.ts            # Mock data for development
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── edgeFunctions.ts       # Edge function helpers
│   ├── navConfig.ts           # Navigation configuration
│   └── utils.ts               # Shared utilities
├── pages/
│   ├── admin/                 # Admin-specific pages
│   ├── super-admin/           # Super admin pages
│   ├── supervisor/            # Supervisor pages
│   ├── employee/              # Employee pages
│   ├── mobile/                # Mobile-specific pages
│   ├── Dashboard.tsx          # Main dashboard
│   ├── Employees.tsx          # Employee CRUD
│   ├── Departments.tsx        # Department CRUD
│   ├── Shifts.tsx             # Shift CRUD
│   ├── Attendance.tsx         # Attendance management
│   ├── Leave.tsx              # Leave management
│   └── Login.tsx              # Authentication
├── App.tsx                    # Router configuration
└── main.tsx                   # Entry point

supabase/
└── functions/
    ├── create-user/
    ├── delete-user/
    ├── reset-password/
    ├── update-user-profile/
    └── seed-database/
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Apply the database schema in Supabase SQL Editor:
   - Run `supabase-schema.sql` (base schema)
   - Run `supabase-migration-shifts.sql` (shifts table)
5. Deploy Edge Functions:
   ```bash
   supabase functions deploy create-user
   supabase functions deploy delete-user
   supabase functions deploy reset-password
   supabase functions deploy update-user-profile
   supabase functions deploy seed-database
   ```
6. Set Edge Function secrets:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
7. Start the dev server:
   ```bash
   npm run dev
   ```

## Navigation Structure

- **Core** — Company, Employee, Department, Shift
- **Time Attendance** — Attendance, Leave, Overtime, Business Trip, Attendance Correction
- **Activity** — Task & Feedback, Daily Activity, Chat, Event & Scheduling, Employee Survey
- **Finance** — Claim, My Payslip

## Design

- White-majority background with black text and purple accents
- Black top navigation bar (desktop) with hover-to-open dropdowns
- Bottom navigation bar (mobile) with 5 core items
- Card-style dropdown menus with icons, titles, and descriptions
- Responsive layout adapting between desktop and mobile views
