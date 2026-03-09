# Edge Functions Usage Guide

## Available Functions

### 1. `seed-database`
Populates the database with sample data for testing.

**What it creates:**
- Company profile
- 6 departments
- 10 employees with different roles:
  - 1 Super Admin (EMP-001)
  - 1 HR Manager/Admin (EMP-002)
  - 1 IT Supervisor (EMP-003)
  - 7 Regular employees (EMP-004 to EMP-010)
- 7 days of attendance records for all employees
- Sample announcements

**Usage:**
- Click the "Seed Database" button on the login page
- Or call the API directly:

```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/seed-database`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
});
```

**Default password for all users:** `password123`

### 2. `create-user`
Creates a new employee user with authentication.

**Required fields:**
- `email` - Employee company email (login + where password is sent)
- `employee_code` - Unique employee code (e.g., EMP-011)
- `first_name` - First name
- `last_name` - Last name

**Optional fields:**
- `password` - If omitted, a random password is generated and emailed to the user
- `phone` - Phone number
- `department` - Department name
- `position` - Job position
- `role` - User role ('employee', 'supervisor', 'admin', 'super_admin')
- `hired_date` - Date hired (YYYY-MM-DD)

**Email setup (for password delivery):** Set Supabase secrets:
```bash
supabase secrets set GMAIL_USER=your@gmail.com GMAIL_PASSWORD="your-app-password"
```
Use a Gmail [App Password](https://support.google.com/accounts/answer/185833) if 2FA is enabled.

**Example:**
```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'newuser@b1gcorp.com',
    employee_code: 'EMP-011',
    first_name: 'New',
    last_name: 'Employee',
    phone: '+63-917-1234567',
    department: 'IT Department',
    position: 'Junior Developer',
    role: 'employee',
    hired_date: '2026-03-04'
  })
});
```

### 3. `reset-password`
Resets a user's password.

**Required:**
- `new_password` - The new password
- Either `user_id` OR `email` to identify the user

**Example with email:**
```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'john.doe@b1gcorp.com',
    new_password: 'newpassword456'
  })
});
```

**Example with user_id:**
```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user_id: 'uuid-here',
    new_password: 'newpassword456'
  })
});
```

### 4. `update-user-profile`
Updates an employee's profile information.

**Required:**
- Either `user_id` OR `email` to identify the user

**Optional fields to update:**
- `employee_code`
- `first_name`
- `last_name`
- `email`
- `phone`
- `department`
- `position`
- `supervisor_id`
- `is_active`
- `hired_date`
- `avatar_url`
- `role`

**Example:**
```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/update-user-profile`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'john.doe@b1gcorp.com',
    position: 'Senior Developer',
    department: 'IT Department',
    phone: '+63-917-9999999'
  })
});
```

## TypeScript Helper Functions

You can create helper functions in your app to call these Edge Functions:

```typescript
// src/lib/edgeFunctions.ts

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function seedDatabase() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/seed-database`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to seed database');
  }
  
  return response.json();
}

export async function createUser(data: {
  email: string;
  password: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  phone?: string;
  department?: string;
  position?: string;
  role?: 'employee' | 'supervisor' | 'admin' | 'super_admin';
  hired_date?: string;
}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create user');
  }
  
  return response.json();
}

export async function resetPassword(identifier: { email?: string; user_id?: string }, newPassword: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...identifier,
      new_password: newPassword,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to reset password');
  }
  
  return response.json();
}

export async function updateUserProfile(
  identifier: { email?: string; user_id?: string },
  updates: {
    employee_code?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    department?: string;
    position?: string;
    supervisor_id?: string;
    is_active?: boolean;
    hired_date?: string;
    avatar_url?: string;
    role?: 'employee' | 'supervisor' | 'admin' | 'super_admin';
  }
) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-user-profile`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...identifier,
      ...updates,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update user profile');
  }
  
  return response.json();
}
```

## Test Accounts After Seeding

After running the seed function, you can login with these accounts:

| Role | Employee Code | Email | Password |
|------|---------------|-------|----------|
| Super Admin | EMP-001 | admin@b1gcorp.com | password123 |
| HR Manager/Admin | EMP-002 | hr.manager@b1gcorp.com | password123 |
| IT Supervisor | EMP-003 | it.supervisor@b1gcorp.com | password123 |
| Developer | EMP-004 | john.doe@b1gcorp.com | password123 |
| Sales Executive | EMP-005 | jane.smith@b1gcorp.com | password123 |
| Marketing Specialist | EMP-006 | mike.johnson@b1gcorp.com | password123 |
| Accountant | EMP-007 | emily.davis@b1gcorp.com | password123 |
| Backend Developer | EMP-008 | david.martinez@b1gcorp.com | password123 |
| HR Specialist | EMP-009 | lisa.anderson@b1gcorp.com | password123 |
| Account Manager | EMP-010 | james.wilson@b1gcorp.com | password123 |

## Notes

- The seed function is idempotent - it will skip users that already exist
- All Edge Functions require the Supabase anon key for authorization
- Edge Functions use the service role key internally for admin operations
- Make sure to deploy the functions and set the service role key secret before using
