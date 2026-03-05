# B1G HRIS - Quick Setup Guide

## 🚀 Quick Start

### 1. Configure Environment Variables

Update your `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in: **Supabase Dashboard > Settings > API**

### 2. Create Database Schema

1. Go to **Supabase Dashboard > SQL Editor**
2. Copy and paste the contents of `supabase-schema.sql`
3. Click "Run" to create all tables and policies

### 3. Deploy Edge Functions

Install Supabase CLI and deploy the functions:

```bash
# Install CLI
brew install supabase/tap/supabase

# Login
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Set the service role key secret
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Deploy all functions
supabase functions deploy create-user
supabase functions deploy reset-password
supabase functions deploy update-user-profile
supabase functions deploy seed-database
```

**Important:** Find your **Service Role Key** in: **Supabase Dashboard > Settings > API > service_role (secret)**

### 4. Seed the Database

Two options:

**Option A - Use the Login Page Button (Easiest):**
1. Run your app: `npm run dev`
2. Go to the login page
3. Click the "Seed Database" button

**Option B - Use SQL Editor:**
1. Go to **Supabase Dashboard > SQL Editor**
2. Copy and paste the contents of `supabase-seed.sql`
3. Click "Run"

### 5. Test Login

After seeding, you can login with:

- **Super Admin:** EMP-001 / password123
- **HR Manager:** EMP-002 / password123
- **Employee:** EMP-004 / password123

## 📁 File Structure

```
B1GHRIS/
├── supabase/
│   └── functions/
│       ├── create-user/          # Create new employee users
│       ├── reset-password/       # Reset user passwords
│       ├── update-user-profile/  # Update user information
│       └── seed-database/        # Seed sample data
├── src/
│   └── pages/
│       └── Login.tsx            # Login page with seed button
├── supabase-schema.sql          # Database schema
├── supabase-seed.sql            # Seed data (SQL version)
├── EDGE_FUNCTIONS_DEPLOYMENT.md # Deployment guide
├── EDGE_FUNCTIONS_USAGE.md      # Usage guide
└── .env                         # Environment variables
```

## 🔧 Edge Functions

### Create User
Creates a new employee with authentication:

```javascript
await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'newuser@b1gcorp.com',
    password: 'password123',
    employee_code: 'EMP-011',
    first_name: 'New',
    last_name: 'Employee',
    department: 'IT Department',
    position: 'Developer',
    role: 'employee'
  })
});
```

### Reset Password
Reset any user's password:

```javascript
await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@b1gcorp.com',
    new_password: 'newpassword123'
  })
});
```

### Update User Profile
Update employee information:

```javascript
await fetch(`${SUPABASE_URL}/functions/v1/update-user-profile`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@b1gcorp.com',
    position: 'Senior Developer',
    phone: '+63-917-9999999'
  })
});
```

## 📚 Documentation

- **EDGE_FUNCTIONS_DEPLOYMENT.md** - How to deploy Edge Functions
- **EDGE_FUNCTIONS_USAGE.md** - Detailed usage examples
- **supabase-schema.sql** - Complete database schema
- **supabase-seed.sql** - Sample data script

## 🧪 Test Accounts

After seeding, use these accounts:

| Role | Code | Email | Password |
|------|------|-------|----------|
| Super Admin | EMP-001 | admin@b1gcorp.com | password123 |
| HR Manager | EMP-002 | hr.manager@b1gcorp.com | password123 |
| IT Supervisor | EMP-003 | it.supervisor@b1gcorp.com | password123 |
| Developer | EMP-004 | john.doe@b1gcorp.com | password123 |
| Sales | EMP-005 | jane.smith@b1gcorp.com | password123 |

## ⚠️ Important Notes

1. **Service Role Key:** Required for Edge Functions to work. Set it as a secret.
2. **Seed Button:** Only works after Edge Functions are deployed
3. **First Time Setup:** Run schema first, then seed data
4. **RLS Policies:** All tables have Row Level Security enabled

## 🆘 Troubleshooting

**"Seed Database" button doesn't work:**
- Check that Edge Functions are deployed
- Verify `.env` has correct credentials
- Check browser console for errors

**Can't login after seeding:**
- Make sure seed completed successfully
- Check Supabase Dashboard > Authentication > Users
- Try: EMP-001 / password123

**Edge Function deployment fails:**
- Run `supabase login` first
- Make sure project is linked
- Check you have the latest Supabase CLI

## 🎯 Next Steps

1. ✅ Configure `.env` file
2. ✅ Run `supabase-schema.sql` in SQL Editor
3. ✅ Deploy Edge Functions
4. ✅ Click "Seed Database" button on login page
5. ✅ Test login with EMP-001 / password123

Happy coding! 🚀
