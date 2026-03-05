# 🎯 B1G HRIS - Complete Setup Package

Everything you need to get your B1G HRIS system up and running with Supabase!

## 📦 What's Included

This setup includes a complete Supabase integration with:

✅ **4 Edge Functions** for user management  
✅ **Seed Database Button** on login page  
✅ **TypeScript Helper Library** for type-safe API calls  
✅ **Complete Documentation** with guides and examples  
✅ **10 Sample Users** with different roles  
✅ **7 Days of Attendance Data** for testing  

---

## 🚀 Quick Start (5 Minutes)

### 1️⃣ Configure Environment Variables

Open `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Find these in:** Supabase Dashboard → Settings → API

### 2️⃣ Create Database Schema

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `supabase-schema.sql`
3. Paste and click "Run"

### 3️⃣ Deploy Edge Functions

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login and link
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set service role key secret
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Deploy all functions
supabase functions deploy create-user
supabase functions deploy reset-password
supabase functions deploy update-user-profile
supabase functions deploy seed-database
```

### 4️⃣ Seed the Database

```bash
# Start your app
npm run dev

# Open login page and click "Seed Database" button
```

### 5️⃣ Test Login

Use: `EMP-001` / `password123`

🎉 **Done!** Your HRIS is ready to use!

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[CHECKLIST.md](CHECKLIST.md)** | Step-by-step setup checklist with troubleshooting |
| **[SETUP_GUIDE.md](SETUP_GUIDE.md)** | Complete setup instructions and configuration |
| **[SUMMARY.md](SUMMARY.md)** | Overview of everything created |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture and data flow diagrams |
| **[EDGE_FUNCTIONS_DEPLOYMENT.md](EDGE_FUNCTIONS_DEPLOYMENT.md)** | How to deploy Edge Functions |
| **[EDGE_FUNCTIONS_USAGE.md](EDGE_FUNCTIONS_USAGE.md)** | API reference and usage examples |

---

## 🔧 Edge Functions

### Available Functions

| Function | Purpose | Usage |
|----------|---------|-------|
| **seed-database** | Populate with sample data | Click button on login page |
| **create-user** | Create new employee | `createUser(data)` |
| **reset-password** | Reset user password | `resetPassword({email}, password)` |
| **update-user-profile** | Update employee info | `updateUserProfile({email}, updates)` |

### TypeScript Examples

```typescript
import { 
  seedDatabase, 
  createUser, 
  resetPassword, 
  updateUserProfile 
} from '@/lib/edgeFunctions';

// Seed database
await seedDatabase();

// Create a new user
const user = await createUser({
  email: 'newuser@b1gcorp.com',
  password: 'password123',
  employee_code: 'EMP-011',
  first_name: 'New',
  last_name: 'User',
  department: 'IT Department',
  position: 'Developer',
  role: 'employee'
});

// Reset password
await resetPassword({ email: 'user@b1gcorp.com' }, 'newpass123');

// Update profile
await updateUserProfile(
  { email: 'user@b1gcorp.com' },
  { position: 'Senior Developer', phone: '+63-917-9999999' }
);
```

---

## 👥 Test Accounts

After seeding, login with these accounts:

| Role | Code | Email | Password |
|------|------|-------|----------|
| 🔑 Super Admin | EMP-001 | admin@b1gcorp.com | password123 |
| 👔 HR Manager | EMP-002 | hr.manager@b1gcorp.com | password123 |
| 👨‍💼 IT Supervisor | EMP-003 | it.supervisor@b1gcorp.com | password123 |
| 💻 Developer | EMP-004 | john.doe@b1gcorp.com | password123 |
| 📊 Sales Executive | EMP-005 | jane.smith@b1gcorp.com | password123 |
| 📈 Marketing | EMP-006 | mike.johnson@b1gcorp.com | password123 |
| 💰 Accountant | EMP-007 | emily.davis@b1gcorp.com | password123 |
| 🖥️ Backend Dev | EMP-008 | david.martinez@b1gcorp.com | password123 |
| 👥 HR Specialist | EMP-009 | lisa.anderson@b1gcorp.com | password123 |
| 🤝 Account Manager | EMP-010 | james.wilson@b1gcorp.com | password123 |

---

## 📁 Project Structure

```
B1GHRIS/
├── supabase/
│   └── functions/              # Edge Functions
│       ├── create-user/
│       ├── reset-password/
│       ├── update-user-profile/
│       └── seed-database/
│
├── src/
│   ├── lib/
│   │   └── edgeFunctions.ts   # TypeScript helper library
│   └── pages/
│       └── Login.tsx           # Updated with seed button
│
├── supabase-schema.sql         # Database schema
├── supabase-seed.sql           # Seed data (SQL alternative)
│
├── .env                        # Your Supabase credentials
├── .env.example                # Template
│
└── Documentation/
    ├── README_COMPLETE.md      # This file
    ├── CHECKLIST.md            # Setup checklist
    ├── SETUP_GUIDE.md          # Setup instructions
    ├── SUMMARY.md              # What was created
    ├── ARCHITECTURE.md         # System architecture
    ├── EDGE_FUNCTIONS_DEPLOYMENT.md
    └── EDGE_FUNCTIONS_USAGE.md
```

---

## 🎨 UI Updates

The login page now includes:

✅ White background with black text  
✅ Purple accent colors  
✅ "Seed Database" button with loading states  
✅ Toast notifications for success/errors  
✅ Clear visual feedback  

---

## 🔒 Security Features

- ✅ **Row Level Security (RLS)** on all tables
- ✅ **Role-based access control** (Super Admin, Admin, Supervisor, Employee)
- ✅ **Service Role Key** for admin operations (Edge Functions only)
- ✅ **Anon Key** for client-side operations (read-only where appropriate)
- ✅ **Password hashing** by Supabase Auth
- ✅ **JWT tokens** for authentication

---

## 🛠️ Troubleshooting

### "Supabase credentials not configured"
➡️ Update `.env` with your Supabase URL and anon key

### "Failed to seed database"
➡️ Make sure Edge Functions are deployed and service role key is set

### "Can't login after seeding"
➡️ Check Supabase Dashboard → Authentication → Users to verify users exist

### Edge Function deployment fails
➡️ Run `supabase login` and `supabase link` first

**For more help, see [CHECKLIST.md](CHECKLIST.md) troubleshooting section**

---

## 📊 What Gets Created When You Seed

| Item | Count | Details |
|------|-------|---------|
| **Users** | 10 | 1 Super Admin, 1 Admin, 1 Supervisor, 7 Employees |
| **Departments** | 6 | Executive, HR, IT, Sales, Marketing, Finance |
| **Attendance Records** | ~50 | 7 days × 10 employees (weekdays only) |
| **Announcements** | 2 | Welcome message + Holiday notice |
| **Company Profile** | 1 | B1G Corporation details |

---

## ⚡ Performance

- **Edge Functions:** ~100-500ms response time
- **Database:** Indexed for optimal queries
- **Seed Time:** ~2-3 seconds for all data
- **RLS Policies:** Optimized with security functions

---

## 🔄 Next Steps After Setup

1. ✅ Customize company profile in database
2. ✅ Add your own departments
3. ✅ Configure work hours and late threshold
4. ✅ Test all user roles and permissions
5. ✅ Integrate with your existing systems
6. ✅ Build additional features on top

---

## 📞 Support

Having issues? Check these resources:

1. **[CHECKLIST.md](CHECKLIST.md)** - Step-by-step guide with troubleshooting
2. **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Detailed setup instructions
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** - Understand the system design
4. **Browser Console** - Check for error messages
5. **Supabase Dashboard** - Verify data and functions

---

## 🎯 Feature Highlights

### User Management
- Create users with authentication
- Assign roles (Employee, Supervisor, Admin, Super Admin)
- Reset passwords
- Update profiles

### Attendance Tracking
- Clock in/out with geolocation
- Automatic late detection
- 7 days of sample attendance data
- Attendance corrections

### Leave Management
- Leave requests (Vacation, Sick, Personal, etc.)
- Approval workflow
- Sample leave requests included

### Organizational Structure
- Departments hierarchy
- Supervisor assignments
- Role-based permissions

---

## 🚧 Important Notes

⚠️ **Service Role Key:** Required for Edge Functions. Set it as a Supabase secret, never in `.env`  
⚠️ **Run Schema First:** Always create schema before seeding  
⚠️ **Idempotent Seeding:** Safe to run multiple times (skips existing users)  
⚠️ **Test Accounts:** All use `password123` - change in production  

---

## 📝 License

This setup is part of the B1G HRIS project.

---

## 🙌 Credits

Built with:
- React + TypeScript + Vite
- Supabase (Auth, Database, Edge Functions)
- Tailwind CSS + Shadcn UI
- Lucide Icons

---

## ✨ Ready to Start?

1. Open **[CHECKLIST.md](CHECKLIST.md)** and follow along
2. Or use the **Quick Start** above
3. Need help? Check **[SETUP_GUIDE.md](SETUP_GUIDE.md)**

**Happy coding! 🚀**

---

*Last Updated: March 4, 2026*
