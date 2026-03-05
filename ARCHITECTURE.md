# B1G HRIS Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         B1G HRIS Frontend                        │
│                     (React + TypeScript + Vite)                  │
│                                                                   │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  Login Page    │  │  Dashboard   │  │  Other Pages     │    │
│  │  - Seed Button │  │              │  │  - Attendance    │    │
│  └────────┬───────┘  └──────────────┘  │  - Employees     │    │
│           │                             │  - Leave Mgmt    │    │
│           │                             └──────────────────┘    │
│           │                                                       │
│           │  Uses: src/lib/edgeFunctions.ts                     │
│           └────────────────┬──────────────────────────────────► │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             │ HTTP Requests
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                            ▼         Supabase Platform            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Supabase Edge Functions                     │    │
│  │                                                          │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │    │
│  │  │create-user  │  │reset-password│  │update-profile│  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────┘  │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │           seed-database                         │   │    │
│  │  │  - Creates users                                │   │    │
│  │  │  - Populates departments                        │   │    │
│  │  │  - Generates attendance records                 │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                          │    │
│  │  Uses: SUPABASE_SERVICE_ROLE_KEY (secret)              │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                         │
│                         │ Admin API                               │
│                         ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Supabase Auth (auth.users)                 │    │
│  │  - User authentication                                  │    │
│  │  - Password management                                  │    │
│  │  - User metadata                                        │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                         │
│                         │ Triggers                                │
│                         ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PostgreSQL Database                        │    │
│  │                                                          │    │
│  │  Core Tables:                    Related Tables:        │    │
│  │  ├─ employees                   ├─ attendance_records   │    │
│  │  ├─ user_roles                  ├─ leave_requests       │    │
│  │  ├─ company_profile             ├─ overtime_requests    │    │
│  │  ├─ departments                 ├─ business_trips       │    │
│  │  └─ announcements               └─ corrections          │    │
│  │                                                          │    │
│  │  Protected by: Row Level Security (RLS) Policies       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Seed Database Flow

```
Login Page (Click "Seed Database")
    │
    ├─► Call: seedDatabase() from edgeFunctions.ts
    │
    └─► POST /functions/v1/seed-database
            │
            ├─► Edge Function: seed-database/index.ts
            │   │
            │   ├─► Create Company Profile
            │   ├─► Create Departments
            │   ├─► For each employee:
            │   │   ├─► Create Auth User (Supabase Auth Admin API)
            │   │   ├─► Update Employee Profile (employees table)
            │   │   └─► Assign Role (user_roles table)
            │   │
            │   ├─► Generate Attendance Records
            │   └─► Create Announcements
            │
            └─► Return Results (users created, errors, etc.)
                    │
                    └─► Show Success/Error Toast
```

### 2. Create User Flow

```
Admin Panel or API Call
    │
    ├─► Call: createUser(data) from edgeFunctions.ts
    │
    └─► POST /functions/v1/create-user
            │
            └─► Edge Function: create-user/index.ts
                │
                ├─► Validate Required Fields
                ├─► Create Auth User (Supabase Auth Admin API)
                │   └─► Trigger: handle_new_user()
                │       ├─► Insert into employees table
                │       └─► Insert into user_roles table (default: employee)
                │
                ├─► Update Employee Profile (optional fields)
                ├─► Update Role (if not 'employee')
                │
                └─► Return User Data
```

### 3. Reset Password Flow

```
Admin/User Request
    │
    ├─► Call: resetPassword({email}, newPassword)
    │
    └─► POST /functions/v1/reset-password
            │
            └─► Edge Function: reset-password/index.ts
                │
                ├─► Find User by Email or UUID
                ├─► Update Password (Supabase Auth Admin API)
                │
                └─► Return Success
```

### 4. Update Profile Flow

```
User/Admin Updates Profile
    │
    ├─► Call: updateUserProfile({email}, updates)
    │
    └─► POST /functions/v1/update-user-profile
            │
            └─► Edge Function: update-user-profile/index.ts
                │
                ├─► Find User by Email or UUID
                ├─► Update employees table
                ├─► Update auth.users if email changed
                ├─► Update user_roles if role changed
                │
                └─► Return Updated User Data
```

## Security Model

### Row Level Security (RLS)

```
┌─────────────────────────────────────────────────────────────┐
│                    RLS Policy Hierarchy                     │
└─────────────────────────────────────────────────────────────┘

Super Admin (super_admin)
    │
    ├─► Full access to all tables
    ├─► Can manage user roles
    └─► Can manage company settings

    └─► Admin (admin)
        │
        ├─► Can read/update all employees
        ├─► Can approve leave/overtime requests
        ├─► Can view all attendance records
        └─► Can create announcements

        └─► Supervisor (supervisor)
            │
            ├─► Can view own data
            ├─► Can view team members' data
            ├─► Can approve team's requests
            └─► Limited to supervised employees

            └─► Employee (employee)
                │
                ├─► Can view own data only
                ├─► Can create own attendance/leave/overtime
                ├─► Can read announcements
                └─► Cannot access other employees' data
```

## Key Components

### Frontend Components

```
src/
├── pages/
│   ├── Login.tsx              ← Updated with seed button
│   ├── Dashboard.tsx
│   ├── Employees.tsx
│   └── ...
├── lib/
│   └── edgeFunctions.ts       ← NEW: Helper library
└── components/
    └── ui/                     ← Shadcn components
```

### Edge Functions

```
supabase/functions/
├── create-user/
│   └── index.ts               ← Creates auth + employee
├── reset-password/
│   └── index.ts               ← Resets password
├── update-user-profile/
│   └── index.ts               ← Updates employee info
└── seed-database/
    └── index.ts               ← Seeds sample data
```

### Database Schema

```
Tables:
├── auth.users                 ← Supabase Auth (managed)
├── employees                  ← Employee profiles
├── user_roles                 ← Role assignments
├── company_profile            ← Company settings
├── departments                ← Organizational structure
├── attendance_records         ← Clock in/out records
├── leave_requests             ← Leave management
├── overtime_requests          ← Overtime tracking
├── business_trips             ← Travel management
├── attendance_corrections     ← Time corrections
└── announcements              ← Company announcements
```

## Authentication Flow

```
1. User enters credentials on Login Page
        ↓
2. Frontend calls Supabase Auth
        ↓
3. Auth validates credentials
        ↓
4. Returns JWT token + user data
        ↓
5. Frontend stores token in localStorage
        ↓
6. All subsequent requests include token
        ↓
7. RLS policies check token for permissions
        ↓
8. Database returns authorized data only
```

## Environment Variables

```
┌─────────────────────────────────────────────────────────────┐
│                    Environment Setup                        │
└─────────────────────────────────────────────────────────────┘

Frontend (.env):
  VITE_SUPABASE_URL          → Supabase project URL
  VITE_SUPABASE_ANON_KEY     → Public anon key

Edge Functions (Secrets):
  SUPABASE_URL               → Auto-set by Supabase
  SUPABASE_SERVICE_ROLE_KEY  → Admin key (set via CLI)
  SUPABASE_ANON_KEY          → Auto-set by Supabase
```

## Deployment Checklist

1. ✅ Update `.env` with credentials
2. ✅ Run `supabase-schema.sql` in SQL Editor
3. ✅ Deploy Edge Functions via Supabase CLI
4. ✅ Set Service Role Key secret
5. ✅ Click "Seed Database" on login page
6. ✅ Test login with EMP-001 / password123

## Performance Considerations

- Edge Functions: ~100-500ms response time
- Database: Indexed on employee_code, dates
- RLS Policies: Optimized with function calls
- Attendance Records: Unique constraint on (employee_id, date)
- Seed Function: Creates ~70 records in ~2-3 seconds

## Future Enhancements

Potential additions:
- [ ] Bulk user import (CSV)
- [ ] Email notifications
- [ ] Role-based dashboards
- [ ] Analytics and reports
- [ ] Mobile app integration
- [ ] Biometric authentication
- [ ] Geofencing for clock in/out
- [ ] Integration with payroll systems
