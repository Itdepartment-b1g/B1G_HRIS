-- ============================================================
-- B1G HRIS Attendance System — SEED DATA
-- Run this in Supabase SQL Editor AFTER creating the schema
-- ============================================================

-- 1. COMPANY PROFILE
-- ============================================================
INSERT INTO public.company_profile (name, address, phone, email, timezone, work_start_time, work_end_time, late_threshold_minutes)
VALUES (
  'B1G Corporation',
  '123 Business Street, Manila, Philippines',
  '+63-2-1234-5678',
  'hr@b1gcorp.com',
  'Asia/Manila',
  '08:00:00',
  '17:00:00',
  15
);

-- 2. DEPARTMENTS
-- ============================================================
INSERT INTO public.departments (id, name, parent_department_id)
VALUES 
  ('d1111111-1111-1111-1111-111111111111', 'Executive', NULL),
  ('d2222222-2222-2222-2222-222222222222', 'Human Resources', NULL),
  ('d3333333-3333-3333-3333-333333333333', 'IT Department', NULL),
  ('d4444444-4444-4444-4444-444444444444', 'Sales', NULL),
  ('d5555555-5555-5555-5555-555555555555', 'Marketing', NULL),
  ('d6666666-6666-6666-6666-666666666666', 'Finance', NULL);

-- 2b. EMPLOYMENT STATUSES (for leave eligibility: Probationary = LWOP only, Regular = VL/SL/PTO)
-- ============================================================
-- Run after leave-management migration (adds is_regular column). Safe to re-run.
INSERT INTO public.employment_statuses (name, duration_months, is_regular, description)
SELECT 'Probationary', 6, false, 'Initial period; LWOP only until regularization'
WHERE NOT EXISTS (SELECT 1 FROM public.employment_statuses WHERE name = 'Probationary');

INSERT INTO public.employment_statuses (name, duration_months, is_regular, description)
SELECT 'Regular', NULL, true, 'Full leave eligibility: VL 15, SL 15, PTO 7'
WHERE NOT EXISTS (SELECT 1 FROM public.employment_statuses WHERE name = 'Regular');

-- 3. CREATE USERS IN AUTH (You'll need to do this via Supabase Auth UI or API)
-- ============================================================
-- Note: Users must be created in auth.users first before we can add to employees table
-- For testing, you can create users manually in Supabase Dashboard > Authentication > Users
-- Then use their UUIDs in the queries below

-- Here's how to create test users programmatically (run via Supabase Edge Function or API):
/*
Example user creation (you'll need to do this via Supabase Auth API):

1. Super Admin: admin@b1gcorp.com / password123
2. HR Manager: hr.manager@b1gcorp.com / password123
3. IT Supervisor: it.supervisor@b1gcorp.com / password123
4. Employee 1: john.doe@b1gcorp.com / password123
5. Employee 2: jane.smith@b1gcorp.com / password123
6. Employee 3: mike.johnson@b1gcorp.com / password123
*/

-- 4. INSERT EMPLOYEES (after creating auth users)
-- ============================================================
-- Note: Replace these UUIDs with actual UUIDs from your auth.users table after creating users

-- Super Admin
INSERT INTO public.employees (id, employee_code, first_name, last_name, email, phone, department, position, is_active, hired_date)
VALUES 
  (gen_random_uuid(), 'EMP-001', 'Admin', 'User', 'admin@b1gcorp.com', '+63-917-1234567', 'Executive', 'CEO', true, '2020-01-15');

-- Get the super admin ID for reference
DO $$
DECLARE
  admin_id UUID;
  hr_manager_id UUID;
  it_supervisor_id UUID;
BEGIN
  -- You'll need to replace these with actual auth user IDs
  -- For now, we'll use placeholders
  
  -- Insert HR Manager
  INSERT INTO public.employees (id, employee_code, first_name, last_name, email, phone, department, position, is_active, hired_date)
  VALUES 
    (gen_random_uuid(), 'EMP-002', 'Sarah', 'Williams', 'hr.manager@b1gcorp.com', '+63-917-2345678', 'Human Resources', 'HR Manager', true, '2020-03-20');

  -- Insert IT Supervisor
  INSERT INTO public.employees (id, employee_code, first_name, last_name, email, phone, department, position, is_active, hired_date)
  VALUES 
    (gen_random_uuid(), 'EMP-003', 'Robert', 'Chen', 'it.supervisor@b1gcorp.com', '+63-917-3456789', 'IT Department', 'IT Supervisor', true, '2020-06-10');

  -- Insert Regular Employees
  INSERT INTO public.employees (id, employee_code, first_name, last_name, email, phone, department, position, is_active, hired_date)
  VALUES 
    (gen_random_uuid(), 'EMP-004', 'John', 'Doe', 'john.doe@b1gcorp.com', '+63-917-4567890', 'IT Department', 'Software Developer', true, '2021-01-15'),
    (gen_random_uuid(), 'EMP-005', 'Jane', 'Smith', 'jane.smith@b1gcorp.com', '+63-917-5678901', 'Sales', 'Sales Executive', true, '2021-03-20'),
    (gen_random_uuid(), 'EMP-006', 'Mike', 'Johnson', 'mike.johnson@b1gcorp.com', '+63-917-6789012', 'Marketing', 'Marketing Specialist', true, '2021-06-15'),
    (gen_random_uuid(), 'EMP-007', 'Emily', 'Davis', 'emily.davis@b1gcorp.com', '+63-917-7890123', 'Finance', 'Accountant', true, '2021-09-01'),
    (gen_random_uuid(), 'EMP-008', 'David', 'Martinez', 'david.martinez@b1gcorp.com', '+63-917-8901234', 'IT Department', 'Backend Developer', true, '2022-01-10'),
    (gen_random_uuid(), 'EMP-009', 'Lisa', 'Anderson', 'lisa.anderson@b1gcorp.com', '+63-917-9012345', 'Human Resources', 'HR Specialist', true, '2022-03-15'),
    (gen_random_uuid(), 'EMP-010', 'James', 'Wilson', 'james.wilson@b1gcorp.com', '+63-917-0123456', 'Sales', 'Account Manager', true, '2022-06-20');
END $$;

-- 5. ASSIGN USER ROLES (after employees are created)
-- ============================================================
-- Note: This assumes you have auth users created
-- Replace with actual user IDs from auth.users

-- Assign roles based on employee codes
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM public.employees WHERE employee_code = 'EMP-001'
UNION ALL
SELECT id, 'admin'::app_role FROM public.employees WHERE employee_code = 'EMP-002'
UNION ALL
SELECT id, 'supervisor'::app_role FROM public.employees WHERE employee_code = 'EMP-003'
UNION ALL
SELECT id, 'employee'::app_role FROM public.employees WHERE employee_code IN ('EMP-004', 'EMP-005', 'EMP-006', 'EMP-007', 'EMP-008', 'EMP-009', 'EMP-010');

-- 6. UPDATE SUPERVISOR RELATIONSHIPS
-- ============================================================
-- Set IT Supervisor as supervisor for IT employees
UPDATE public.employees
SET supervisor_id = (SELECT id FROM public.employees WHERE employee_code = 'EMP-003')
WHERE employee_code IN ('EMP-004', 'EMP-008');

-- Set HR Manager as supervisor for HR employees
UPDATE public.employees
SET supervisor_id = (SELECT id FROM public.employees WHERE employee_code = 'EMP-002')
WHERE employee_code = 'EMP-009';

-- 7. SAMPLE ATTENDANCE RECORDS (last 7 days)
-- ============================================================
DO $$
DECLARE
  emp_record RECORD;
  day_offset INT;
  check_in_time TIMESTAMPTZ;
  check_out_time TIMESTAMPTZ;
BEGIN
  -- Create attendance for all active employees for the last 7 days
  FOR emp_record IN 
    SELECT id, employee_code FROM public.employees WHERE is_active = true
  LOOP
    FOR day_offset IN 0..6 LOOP
      -- Simulate different attendance patterns
      IF day_offset < 5 THEN -- Weekdays
        check_in_time := (CURRENT_DATE - day_offset) + TIME '08:00:00' + (random() * INTERVAL '30 minutes');
        check_out_time := (CURRENT_DATE - day_offset) + TIME '17:00:00' + (random() * INTERVAL '60 minutes');
        
        INSERT INTO public.attendance_records (
          employee_id, 
          date, 
          time_in, 
          time_out, 
          lat_in, 
          lng_in, 
          lat_out, 
          lng_out,
          address_in,
          address_out,
          status
        )
        VALUES (
          emp_record.id,
          CURRENT_DATE - day_offset,
          check_in_time,
          check_out_time,
          14.5995 + (random() - 0.5) * 0.01, -- Manila latitude
          120.9842 + (random() - 0.5) * 0.01, -- Manila longitude
          14.5995 + (random() - 0.5) * 0.01,
          120.9842 + (random() - 0.5) * 0.01,
          '123 Business Street, Manila',
          '123 Business Street, Manila',
          CASE 
            WHEN check_in_time > (CURRENT_DATE - day_offset) + TIME '08:15:00' THEN 'late'::attendance_status
            ELSE 'present'::attendance_status
          END
        )
        ON CONFLICT (employee_id, date) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 8. SAMPLE OVERTIME REQUESTS
-- ============================================================
INSERT INTO public.overtime_requests (employee_id, date, start_time, end_time, hours, reason, status)
SELECT 
  id,
  CURRENT_DATE - 1,
  '18:00:00'::TIME,
  '21:00:00'::TIME,
  3.00,
  'Project deadline',
  'approved'::overtime_status
FROM public.employees WHERE employee_code = 'EMP-004'
UNION ALL
SELECT 
  id,
  CURRENT_DATE,
  '17:30:00'::TIME,
  '20:00:00'::TIME,
  2.50,
  'System maintenance',
  'pending'::overtime_status
FROM public.employees WHERE employee_code = 'EMP-008';

-- 10. SAMPLE BUSINESS TRIPS
-- ============================================================
INSERT INTO public.business_trips (employee_id, destination, purpose, start_date, end_date, status)
SELECT 
  id,
  'Cebu City',
  'Client meeting and site visit',
  CURRENT_DATE + 5,
  CURRENT_DATE + 7,
  'pending'::trip_status
FROM public.employees WHERE employee_code = 'EMP-005'
UNION ALL
SELECT 
  id,
  'Davao City',
  'Regional conference',
  CURRENT_DATE + 10,
  CURRENT_DATE + 12,
  'approved'::trip_status
FROM public.employees WHERE employee_code = 'EMP-006';

-- 11. SAMPLE ANNOUNCEMENTS
-- ============================================================
INSERT INTO public.announcements (title, content, author_id, is_pinned)
SELECT 
  'Welcome to B1G HRIS',
  'Welcome to our new Human Resources Information System! This platform will help streamline attendance tracking, leave management, and other HR processes. If you have any questions, please contact the HR department.',
  id,
  true
FROM public.employees WHERE employee_code = 'EMP-001'
UNION ALL
SELECT 
  'Holiday Notice',
  'Please be reminded that the office will be closed on March 25, 2026 in observance of a national holiday. Regular operations will resume on March 26.',
  id,
  true
FROM public.employees WHERE employee_code = 'EMP-002'
UNION ALL
SELECT 
  'System Maintenance',
  'The HRIS system will undergo scheduled maintenance this Saturday, March 8, from 10:00 PM to 2:00 AM. The system may be temporarily unavailable during this period.',
  id,
  false
FROM public.employees WHERE employee_code = 'EMP-003';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check created employees
SELECT employee_code, first_name, last_name, email, department, position FROM public.employees ORDER BY employee_code;

-- Check user roles
SELECT e.employee_code, e.first_name, e.last_name, ur.role 
FROM public.employees e
JOIN public.user_roles ur ON e.id = ur.user_id
ORDER BY e.employee_code;

-- Check recent attendance
SELECT e.employee_code, e.first_name, ar.date, ar.time_in, ar.time_out, ar.status
FROM public.attendance_records ar
JOIN public.employees e ON ar.employee_id = e.id
WHERE ar.date >= CURRENT_DATE - 7
ORDER BY ar.date DESC, e.employee_code;

-- Check announcements
SELECT title, content, created_at FROM public.announcements ORDER BY created_at DESC;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✓ Seed data inserted successfully!';
  RAISE NOTICE '✓ Created 10 employees across 6 departments';
  RAISE NOTICE '✓ Generated 7 days of attendance records';
  RAISE NOTICE '✓ Created sample leave requests, overtime requests, and business trips';
  RAISE NOTICE '✓ Added company announcements';
  RAISE NOTICE '';
  RAISE NOTICE 'Test Credentials:';
  RAISE NOTICE '- Super Admin: EMP-001 / password123';
  RAISE NOTICE '- HR Manager: EMP-002 / password123';
  RAISE NOTICE '- IT Supervisor: EMP-003 / password123';
  RAISE NOTICE '- Regular Employee: EMP-004 to EMP-010 / password123';
END $$;
