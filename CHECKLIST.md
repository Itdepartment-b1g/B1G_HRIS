# B1G HRIS Setup Checklist

Use this checklist to track your setup progress.

## 📋 Setup Tasks

### 1. Environment Configuration
- [ ] Open `.env` file
- [ ] Go to Supabase Dashboard > Settings > API
- [ ] Copy Project URL to `VITE_SUPABASE_URL`
- [ ] Copy anon/public key to `VITE_SUPABASE_ANON_KEY`
- [ ] Save `.env` file

### 2. Database Schema
- [ ] Open Supabase Dashboard
- [ ] Navigate to SQL Editor
- [ ] Open `supabase-schema.sql` file
- [ ] Copy all contents
- [ ] Paste into SQL Editor
- [ ] Click "Run"
- [ ] Verify success (check for green checkmark)

### 3. Supabase CLI Setup
- [ ] Install Supabase CLI: `brew install supabase/tap/supabase`
- [ ] Login: `supabase login`
- [ ] Get your project ref from Supabase Dashboard (Project Settings > General)
- [ ] Link project: `supabase link --project-ref YOUR_PROJECT_REF`
- [ ] Verify link successful

### 4. Edge Functions Deployment
- [ ] Get Service Role Key from Supabase Dashboard > Settings > API > service_role (secret)
- [ ] Set secret: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`
- [ ] Deploy create-user: `supabase functions deploy create-user`
- [ ] Deploy reset-password: `supabase functions deploy reset-password`
- [ ] Deploy update-user-profile: `supabase functions deploy update-user-profile`
- [ ] Deploy seed-database: `supabase functions deploy seed-database`
- [ ] Verify all functions deployed in Supabase Dashboard > Edge Functions

### 5. Seed Database
- [ ] Start dev server: `npm run dev`
- [ ] Open login page in browser
- [ ] Click "Seed Database" button
- [ ] Wait for success message
- [ ] Verify users created in Supabase Dashboard > Authentication > Users
- [ ] Should see 10 users (EMP-001 to EMP-010)

### 6. Test Login
- [ ] Try logging in with: `EMP-001` / `password123`
- [ ] Should redirect to dashboard
- [ ] Try logging in with: `EMP-004` / `password123`
- [ ] Try logging in with wrong credentials (should show error)

### 7. Verify Database
Go to Supabase Dashboard > Table Editor and verify:
- [ ] `company_profile` has 1 row (B1G Corporation)
- [ ] `departments` has 6 rows
- [ ] `employees` has 10 rows
- [ ] `user_roles` has 10 rows
- [ ] `attendance_records` has ~40-50 rows (7 days × 10 employees)
- [ ] `announcements` has 2 rows

### 8. Test Edge Functions
Try creating a new user via TypeScript:
```typescript
import { createUser } from '@/lib/edgeFunctions';

const user = await createUser({
  email: 'test@b1gcorp.com',
  password: 'test123',
  employee_code: 'EMP-011',
  first_name: 'Test',
  last_name: 'User',
  department: 'IT Department',
  position: 'Tester'
});
```

- [ ] Create test user
- [ ] Verify user in Supabase Dashboard
- [ ] Try logging in with new user
- [ ] Test password reset
- [ ] Test profile update

## 🎯 Optional Tasks

### Additional Configuration
- [ ] Customize company profile in database
- [ ] Add more departments if needed
- [ ] Configure work hours (currently 8 AM - 5 PM)
- [ ] Set late threshold (currently 15 minutes)

### Security
- [ ] Review RLS policies in `supabase-schema.sql`
- [ ] Test that employees can only see their own data
- [ ] Test that admins can see all data
- [ ] Test that supervisors can see their team's data

### Testing
- [ ] Test attendance clock in/out
- [ ] Test leave requests
- [ ] Test overtime requests
- [ ] Test announcements
- [ ] Test all user roles (admin, supervisor, employee)

## ✅ Completion Checklist

- [ ] All environment variables configured
- [ ] Database schema created successfully
- [ ] All Edge Functions deployed
- [ ] Database seeded with sample data
- [ ] Can login with test accounts
- [ ] All tables populated correctly
- [ ] Edge Functions working (create, reset, update)
- [ ] Application running without errors

## 🚨 If Something Doesn't Work

### Environment Issues
**Problem:** "Supabase credentials not configured"
**Solution:** Check `.env` file has correct URL and key

### Schema Issues
**Problem:** SQL errors when creating schema
**Solution:** Make sure you're in a new project or drop existing tables first

### Edge Function Issues
**Problem:** Functions not deploying
**Solution:** 
1. Check `supabase login` is successful
2. Check `supabase link` is successful
3. Try `supabase functions list` to see if project is linked

**Problem:** "Service role key not set"
**Solution:** Run `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key`

### Seed Issues
**Problem:** Seed button doesn't work
**Solution:**
1. Check browser console for errors
2. Verify Edge Functions are deployed
3. Check `.env` has correct credentials
4. Try seeding via SQL Editor with `supabase-seed.sql`

### Login Issues
**Problem:** Can't login after seeding
**Solution:**
1. Check Supabase Dashboard > Authentication > Users
2. Make sure users exist
3. Try: EMP-001 / password123
4. Check browser console for errors

## 📞 Quick Reference

### Default Login Credentials
```
Super Admin: EMP-001 / password123
HR Manager:  EMP-002 / password123
Employee:    EMP-004 / password123
```

### Important URLs
- Supabase Dashboard: https://app.supabase.com/
- SQL Editor: Dashboard > SQL Editor
- Edge Functions: Dashboard > Edge Functions
- Authentication: Dashboard > Authentication > Users
- Table Editor: Dashboard > Table Editor

### Important Files
- `.env` - Environment variables
- `supabase-schema.sql` - Database schema
- `SETUP_GUIDE.md` - Full setup guide
- `SUMMARY.md` - What was created
- `src/lib/edgeFunctions.ts` - Helper functions

## 🎉 Success!

When all checkboxes are checked, your B1G HRIS is fully set up and ready to use!

---

**Date Started:** ___________
**Date Completed:** ___________
**Notes:**
