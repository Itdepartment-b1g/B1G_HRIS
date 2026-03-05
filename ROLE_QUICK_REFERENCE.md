# 🎯 Quick Reference - Role-Based Pages

## 📁 Folder Structure at a Glance

```
src/pages/
├── super-admin/    → Full system access
├── admin/          → HR management access  
├── supervisor/     → Team management
└── employee/       → Personal access only
```

---

## 🔑 Routes Quick Reference

| Role | Dashboard | Management Page | Add Employee |
|------|-----------|-----------------|--------------|
| **Super Admin** | `/super-admin/dashboard` | `/super-admin/employees` | `/super-admin/add-employee` |
| **Admin** | `/admin/dashboard` | `/admin/employees` | `/admin/add-employee` |
| **Supervisor** | `/supervisor/dashboard` | `/supervisor/team` | ❌ Not available |
| **Employee** | `/employee/dashboard` | `/employee/profile` | ❌ Not available |

---

## 👥 Test Accounts

| Role | Code | Email | Password |
|------|------|-------|----------|
| 🔑 Super Admin | `EMP-001` | admin@b1gcorp.com | password123 |
| 👔 Admin | `EMP-002` | hr.manager@b1gcorp.com | password123 |
| 👨‍💼 Supervisor | `EMP-003` | it.supervisor@b1gcorp.com | password123 |
| 💼 Employee | `EMP-004` | john.doe@b1gcorp.com | password123 |

---

## 📝 Add Employee - Quick Guide

### Super Admin Can Create:
- ✅ Employee
- ✅ Supervisor  
- ✅ Admin
- ✅ Super Admin

### Admin Can Create:
- ✅ Employee
- ✅ Supervisor
- ❌ Admin
- ❌ Super Admin

### Required Fields:
1. Employee Code (e.g., EMP-011)
2. Email
3. First Name
4. Last Name
5. Role

### Optional Fields:
- Phone
- Department
- Position
- Hired Date
- Initial Password (defaults to password123)

---

## 🎨 Import Examples

```typescript
// Import Super Admin pages
import { 
  SuperAdminDashboard, 
  SuperAdminEmployees, 
  SuperAdminAddEmployee 
} from '@/pages/super-admin';

// Import Admin pages
import { 
  AdminDashboard, 
  AdminEmployees, 
  AdminAddEmployee 
} from '@/pages/admin';

// Import Supervisor pages
import { 
  SupervisorDashboard, 
  SupervisorTeam 
} from '@/pages/supervisor';

// Import Employee pages
import { 
  EmployeeDashboard, 
  EmployeeProfile 
} from '@/pages/employee';
```

---

## 🔐 Role Permissions Matrix

| Feature | Super Admin | Admin | Supervisor | Employee |
|---------|:-----------:|:-----:|:----------:|:--------:|
| View All Employees | ✅ | ✅ | ❌ | ❌ |
| Add Employee | ✅ | ✅* | ❌ | ❌ |
| Edit Employee | ✅ | ✅ | ❌ | ❌ |
| Delete Employee | ✅ | ❌ | ❌ | ❌ |
| View Team | ✅ | ✅ | ✅ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ |

*Admin can only create Employee and Supervisor roles

---

## 🚀 Quick Start

### 1. Test Add Employee (Super Admin)
```bash
# 1. Login as Super Admin
Code: EMP-001
Password: password123

# 2. Navigate to
/super-admin/add-employee

# 3. Fill form and submit
```

### 2. Test Add Employee (Admin)
```bash
# 1. Login as Admin  
Code: EMP-002
Password: password123

# 2. Navigate to
/admin/add-employee

# 3. Notice role dropdown is limited
```

### 3. View Team (Supervisor)
```bash
# 1. Login as Supervisor
Code: EMP-003
Password: password123

# 2. Navigate to
/supervisor/team

# 3. See team members only
```

### 4. View Profile (Employee)
```bash
# 1. Login as Employee
Code: EMP-004
Password: password123

# 2. Navigate to
/employee/profile

# 3. See personal info
```

---

## 💻 Code Snippets

### Create Employee
```typescript
import { createUser } from '@/lib/edgeFunctions';

await createUser({
  employee_code: 'EMP-011',
  email: 'new@b1gcorp.com',
  password: 'password123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'employee'
});
```

### Check User Role
```typescript
const user = JSON.parse(
  localStorage.getItem('hris_user') || '{}'
);

const isSuperAdmin = user.role === 'super_admin';
const isAdmin = user.role === 'admin';
const isSupervisor = user.role === 'supervisor';
const isEmployee = user.role === 'employee';
```

### Role-Based Rendering
```typescript
{user.role === 'super_admin' && (
  <Link to="/super-admin/add-employee">
    Add Employee
  </Link>
)}

{['super_admin', 'admin'].includes(user.role) && (
  <Link to={`/${user.role}/employees`}>
    View Employees
  </Link>
)}
```

---

## 📋 Checklist

### Setup (Required)
- [ ] Add routes for role-based pages
- [ ] Implement route protection
- [ ] Update navigation menu
- [ ] Test with each role

### Testing
- [ ] Login as super admin → add employee (all roles)
- [ ] Login as admin → add employee (limited roles)
- [ ] Login as supervisor → view team
- [ ] Login as employee → view profile
- [ ] Verify Edge Function integration
- [ ] Test search functionality
- [ ] Verify role restrictions

---

## 📚 Documentation

- **ROLE_BASED_STRUCTURE.md** - Complete guide
- **ROLE_STRUCTURE_SUMMARY.md** - Detailed summary
- **ROLE_QUICK_REFERENCE.md** - This file

---

## 🆘 Troubleshooting

**Q: Add Employee button doesn't work?**  
A: Make sure Edge Functions are deployed and `.env` has correct credentials

**Q: Can't access role-specific pages?**  
A: Implement route protection based on user role

**Q: Role dropdown shows all roles for Admin?**  
A: Check the AddEmployee.tsx file - Admin should only see employee/supervisor

**Q: Search not working?**  
A: Verify state is updating and filter logic is correct

---

## 🎯 Files Created

- `src/pages/super-admin/Dashboard.tsx`
- `src/pages/super-admin/Employees.tsx`
- `src/pages/super-admin/AddEmployee.tsx`
- `src/pages/super-admin/index.ts`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/Employees.tsx`
- `src/pages/admin/AddEmployee.tsx`
- `src/pages/admin/index.ts`
- `src/pages/supervisor/Dashboard.tsx`
- `src/pages/supervisor/Team.tsx`
- `src/pages/supervisor/index.ts`
- `src/pages/employee/Dashboard.tsx`
- `src/pages/employee/Profile.tsx`
- `src/pages/employee/index.ts`

**Total: 14 new files**

---

**Last Updated:** March 4, 2026  
**Version:** 1.0
