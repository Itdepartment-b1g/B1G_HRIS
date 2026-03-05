# Role-Based Folder Structure

## 📁 New Folder Organization

Your B1G HRIS now has a role-based folder structure that segregates pages and features by user role.

```
src/pages/
├── Login.tsx                    # Public login page
├── NotFound.tsx                 # 404 page
├── Index.tsx                    # Landing/redirect page
│
├── super-admin/                 # 🔑 Super Admin Pages
│   ├── Dashboard.tsx           # Super admin dashboard
│   ├── Employees.tsx           # Employee management (full access)
│   └── AddEmployee.tsx         # Add new employee (all roles)
│
├── admin/                       # 👔 Admin Pages
│   ├── Dashboard.tsx           # Admin dashboard
│   ├── Employees.tsx           # Employee management (limited)
│   └── AddEmployee.tsx         # Add new employee (employee/supervisor only)
│
├── supervisor/                  # 👨‍💼 Supervisor/Manager Pages
│   ├── Dashboard.tsx           # Supervisor dashboard
│   └── Team.tsx                # View team members
│
├── employee/                    # 💼 Employee Pages
│   ├── Dashboard.tsx           # Employee dashboard
│   └── Profile.tsx             # Personal profile
│
└── shared/                      # 📄 Shared Pages (all roles)
    ├── Dashboard.tsx           # Base dashboard component
    ├── Attendance.tsx          # Attendance tracking
    ├── Leave.tsx               # Leave requests
    └── PlaceholderPages.tsx    # Placeholder components
```

---

## 🔐 Role Permissions

### Super Admin
**Full system access**

Pages:
- ✅ Dashboard
- ✅ Employee Management (view all, add, edit, delete)
- ✅ Add Employee (can create all roles: employee, supervisor, admin, super_admin)
- ✅ Attendance (all employees)
- ✅ Leave Management (approve all)
- ✅ System Settings
- ✅ Company Profile

### Admin  
**HR and management access**

Pages:
- ✅ Dashboard
- ✅ Employee Management (view all, add, edit)
- ✅ Add Employee (can create: employee, supervisor only)
- ✅ Attendance (all employees)
- ✅ Leave Management (approve all)
- ❌ System Settings (read-only)
- ❌ Super Admin features

### Supervisor/Manager
**Team management access**

Pages:
- ✅ Dashboard
- ✅ Team Management (view team members only)
- ✅ Attendance (team members only)
- ✅ Leave Management (approve team requests only)
- ❌ Add Employee
- ❌ System Settings
- ❌ Admin features

### Employee
**Personal access only**

Pages:
- ✅ Dashboard
- ✅ Personal Profile
- ✅ My Attendance
- ✅ My Leave Requests
- ❌ Employee Management
- ❌ Team Management
- ❌ System Settings

---

## 🎯 New Pages Created

### 1. **Super Admin - Add Employee**
**Path:** `/super-admin/add-employee`  
**File:** `src/pages/super-admin/AddEmployee.tsx`

Features:
- Create employees with any role (employee, supervisor, admin, super_admin)
- Full form with all fields
- Integrates with `createUser` Edge Function
- Success/error toast notifications

### 2. **Super Admin - Employee Management**
**Path:** `/super-admin/employees`  
**File:** `src/pages/super-admin/Employees.tsx`

Features:
- View all employees
- Search functionality
- Filter by role/department
- Add Employee button
- Edit/Delete actions

### 3. **Admin - Add Employee**
**Path:** `/admin/add-employee`  
**File:** `src/pages/admin/AddEmployee.tsx`

Features:
- Create employees (employee and supervisor roles only)
- Restricted from creating admin/super_admin
- Same form interface as super admin
- Integrates with Edge Function

### 4. **Admin - Employee Management**
**Path:** `/admin/employees`  
**File:** `src/pages/admin/Employees.tsx`

Features:
- View all employees
- Search functionality
- Add Employee button (limited roles)
- Edit actions (no delete)

### 5. **Supervisor - Team Management**
**Path:** `/supervisor/team`  
**File:** `src/pages/supervisor/Team.tsx`

Features:
- View team members only
- Search team
- View attendance/leave status
- Cannot add/edit employees

### 6. **Employee - Profile**
**Path:** `/employee/profile`  
**File:** `src/pages/employee/Profile.tsx`

Features:
- View personal information
- Update contact details
- View employment history
- Cannot access other employees

---

## 🛣️ Routing Structure

Update your routes to use the new role-based structure:

```typescript
// Example routing (you'll need to implement this)
import { Routes, Route } from 'react-router-dom';

// Super Admin Routes
<Route path="/super-admin">
  <Route path="dashboard" element={<SuperAdminDashboard />} />
  <Route path="employees" element={<SuperAdminEmployees />} />
  <Route path="add-employee" element={<SuperAdminAddEmployee />} />
</Route>

// Admin Routes
<Route path="/admin">
  <Route path="dashboard" element={<AdminDashboard />} />
  <Route path="employees" element={<AdminEmployees />} />
  <Route path="add-employee" element={<AdminAddEmployee />} />
</Route>

// Supervisor Routes
<Route path="/supervisor">
  <Route path="dashboard" element={<SupervisorDashboard />} />
  <Route path="team" element={<SupervisorTeam />} />
</Route>

// Employee Routes
<Route path="/employee">
  <Route path="dashboard" element={<EmployeeDashboard />} />
  <Route path="profile" element={<EmployeeProfile />} />
</Route>
```

---

## 🔄 Navigation Menu Updates

Update your sidebar/navigation to show role-specific menu items:

### Super Admin Menu
```
📊 Dashboard
👥 Employees
   - View All
   - Add Employee
📅 Attendance
📝 Leave Management
⚙️ Settings
```

### Admin Menu
```
📊 Dashboard
👥 Employees
   - View All
   - Add Employee
📅 Attendance
📝 Leave Management
```

### Supervisor Menu
```
📊 Dashboard
👥 My Team
📅 Team Attendance
📝 Team Leave Requests
```

### Employee Menu
```
📊 Dashboard
👤 My Profile
📅 My Attendance
📝 My Leave Requests
```

---

## 🎨 Add Employee Features

Both Super Admin and Admin can add employees using the Edge Function:

### Form Fields:
- **Employee Code** (required) - e.g., EMP-011
- **Email** (required) - User's email address
- **First Name** (required)
- **Last Name** (required)
- **Phone** (optional)
- **Hired Date** (optional)
- **Department** (optional) - Dropdown
- **Position** (optional)
- **Role** (required) - Dropdown
  - Super Admin: Can select all roles
  - Admin: Can select employee/supervisor only
- **Initial Password** (required) - Default: password123

### Integration:
```typescript
import { createUser } from '@/lib/edgeFunctions';

const result = await createUser({
  email: 'newuser@b1gcorp.com',
  password: 'password123',
  employee_code: 'EMP-011',
  first_name: 'John',
  last_name: 'Doe',
  department: 'IT Department',
  position: 'Developer',
  role: 'employee'
});
```

---

## 🔐 Security Implementation

### Route Protection
You'll need to implement route guards based on user role:

```typescript
// Example middleware/guard
const ProtectedRoute = ({ role, children }) => {
  const user = getCurrentUser(); // Get from localStorage/context
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (role && user.role !== role) {
    return <Navigate to="/unauthorized" />;
  }
  
  return children;
};
```

### Role Checking
```typescript
// Helper function
const hasRole = (user, requiredRole) => {
  const roleHierarchy = {
    'super_admin': 4,
    'admin': 3,
    'supervisor': 2,
    'employee': 1
  };
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
};
```

---

## 📝 Next Steps

### 1. Update Routing
- [ ] Implement role-based routes
- [ ] Add route guards/protection
- [ ] Set up redirects based on user role

### 2. Update Navigation
- [ ] Show/hide menu items based on role
- [ ] Update sidebar component
- [ ] Add role badges to UI

### 3. Test Each Role
- [ ] Login as super_admin (EMP-001)
- [ ] Login as admin (EMP-002)
- [ ] Login as supervisor (EMP-003)
- [ ] Login as employee (EMP-004)

### 4. Implement Missing Features
- [ ] Edit Employee page
- [ ] Delete Employee (super admin only)
- [ ] Role change functionality
- [ ] Bulk actions

---

## 🚀 Quick Test

After seeding your database:

1. **Login as Super Admin:**
   - Code: `EMP-001` / Password: `password123`
   - Navigate to `/super-admin/employees`
   - Click "Add Employee"
   - Create a new employee with any role

2. **Login as Admin:**
   - Code: `EMP-002` / Password: `password123`
   - Navigate to `/admin/employees`
   - Click "Add Employee"
   - Notice you can only create employee/supervisor roles

3. **Login as Supervisor:**
   - Code: `EMP-003` / Password: `password123`
   - Navigate to `/supervisor/team`
   - View your team members

4. **Login as Employee:**
   - Code: `EMP-004` / Password: `password123`
   - Navigate to `/employee/profile`
   - View your personal information

---

## 📚 Related Files

- `src/lib/edgeFunctions.ts` - Helper functions for API calls
- `supabase/functions/create-user/index.ts` - Edge Function for creating users
- `supabase-schema.sql` - Database schema with RLS policies
- `ARCHITECTURE.md` - System architecture documentation

---

## 🎯 Summary

Your HRIS now has a complete role-based folder structure with:
- ✅ 4 role-specific folders (super-admin, admin, supervisor, employee)
- ✅ Add Employee pages for Super Admin and Admin
- ✅ Role-specific dashboards
- ✅ Team management for supervisors
- ✅ Profile page for employees
- ✅ Integration with Edge Functions
- ✅ Clean, organized codebase

Next: Implement routing and role-based access control! 🚀
