// Edge Function: Seed Database
// Deploy: supabase functions deploy seed-database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const employeesData = [
  {
    employee_code: 'EMP-001',
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@b1gcorp.com',
    phone: '+63-917-1234567',
    department: 'Executive',
    position: 'CEO',
    role: 'super_admin',
    password: 'password123'
  },
  {
    employee_code: 'EMP-002',
    first_name: 'Sarah',
    last_name: 'Williams',
    email: 'hr.manager@b1gcorp.com',
    phone: '+63-917-2345678',
    department: 'Human Resources',
    position: 'HR Manager',
    role: 'admin',
    password: 'password123'
  },
  {
    employee_code: 'EMP-003',
    first_name: 'Robert',
    last_name: 'Chen',
    email: 'it.supervisor@b1gcorp.com',
    phone: '+63-917-3456789',
    department: 'IT Department',
    position: 'IT Supervisor',
    role: 'supervisor',
    password: 'password123'
  },
  {
    employee_code: 'EMP-004',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@b1gcorp.com',
    phone: '+63-917-4567890',
    department: 'IT Department',
    position: 'Software Developer',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-005',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@b1gcorp.com',
    phone: '+63-917-5678901',
    department: 'Sales',
    position: 'Sales Executive',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-006',
    first_name: 'Mike',
    last_name: 'Johnson',
    email: 'mike.johnson@b1gcorp.com',
    phone: '+63-917-6789012',
    department: 'Marketing',
    position: 'Marketing Specialist',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-007',
    first_name: 'Emily',
    last_name: 'Davis',
    email: 'emily.davis@b1gcorp.com',
    phone: '+63-917-7890123',
    department: 'Finance',
    position: 'Accountant',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-008',
    first_name: 'David',
    last_name: 'Martinez',
    email: 'david.martinez@b1gcorp.com',
    phone: '+63-917-8901234',
    department: 'IT Department',
    position: 'Backend Developer',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-009',
    first_name: 'Lisa',
    last_name: 'Anderson',
    email: 'lisa.anderson@b1gcorp.com',
    phone: '+63-917-9012345',
    department: 'Human Resources',
    position: 'HR Specialist',
    role: 'employee',
    password: 'password123'
  },
  {
    employee_code: 'EMP-010',
    first_name: 'James',
    last_name: 'Wilson',
    email: 'james.wilson@b1gcorp.com',
    phone: '+63-917-0123456',
    department: 'Sales',
    position: 'Account Manager',
    role: 'employee',
    password: 'password123'
  }
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const results = {
      success: true,
      created_users: [],
      errors: [],
      company_profile: null,
      departments: null,
      announcements: null
    }

    // 1. Create Company Profile
    const { data: companyData, error: companyError } = await supabaseClient
      .from('company_profile')
      .insert({
        name: 'B1G Corporation',
        address: '123 Business Street, Manila, Philippines',
        phone: '+63-2-1234-5678',
        email: 'hr@b1gcorp.com',
        timezone: 'Asia/Manila',
        work_start_time: '08:00:00',
        work_end_time: '17:00:00',
        late_threshold_minutes: 15
      })
      .select()
      .single()

    if (!companyError) {
      results.company_profile = companyData
    } else {
      console.log('Company profile error (may already exist):', companyError.message)
    }

    // 2. Create Departments
    const departments = [
      { name: 'Executive' },
      { name: 'Human Resources' },
      { name: 'IT Department' },
      { name: 'Sales' },
      { name: 'Marketing' },
      { name: 'Finance' }
    ]

    const { data: deptData, error: deptError } = await supabaseClient
      .from('departments')
      .upsert(departments, { onConflict: 'name' })
      .select()

    if (!deptError) {
      results.departments = deptData
    } else {
      console.log('Departments error:', deptError.message)
    }

    // 3. Create Users
    for (const employee of employeesData) {
      try {
        const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
          email: employee.email,
          password: employee.password,
          email_confirm: true,
          user_metadata: {
            employee_code: employee.employee_code,
            first_name: employee.first_name,
            last_name: employee.last_name,
          }
        })

        if (authError) {
          // User might already exist
          console.log(`User ${employee.email} error:`, authError.message)
          results.errors.push({
            email: employee.email,
            error: authError.message
          })
          continue
        }

        // Update employee profile
        await supabaseClient
          .from('employees')
          .update({
            employee_code: employee.employee_code,
            first_name: employee.first_name,
            last_name: employee.last_name,
            email: employee.email,
            phone: employee.phone,
            department: employee.department,
            position: employee.position,
            hired_date: new Date().toISOString().split('T')[0],
            is_active: true,
          })
          .eq('id', authUser.user.id)

        // Assign role
        await supabaseClient
          .from('user_roles')
          .update({ role: employee.role })
          .eq('user_id', authUser.user.id)

        results.created_users.push({
          email: employee.email,
          employee_code: employee.employee_code,
          role: employee.role
        })

      } catch (error) {
        console.error(`Error creating user ${employee.email}:`, error)
        results.errors.push({
          email: employee.email,
          error: error.message
        })
      }
    }

    // 4. Generate Sample Attendance (last 7 days for all users)
    const { data: employees } = await supabaseClient
      .from('employees')
      .select('id')
      .eq('is_active', true)

    if (employees) {
      for (const emp of employees) {
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const date = new Date()
          date.setDate(date.getDate() - dayOffset)
          const dateStr = date.toISOString().split('T')[0]

          // Skip weekends
          if (date.getDay() === 0 || date.getDay() === 6) continue

          const checkInHour = 8 + Math.floor(Math.random() * 0.5) // 8:00-8:30
          const checkInMinute = Math.floor(Math.random() * 30)
          const checkOutHour = 17 + Math.floor(Math.random() * 1) // 17:00-18:00
          const checkOutMinute = Math.floor(Math.random() * 60)

          await supabaseClient
            .from('attendance_records')
            .insert({
              employee_id: emp.id,
              date: dateStr,
              time_in: `${dateStr}T${String(checkInHour).padStart(2, '0')}:${String(checkInMinute).padStart(2, '0')}:00`,
              time_out: `${dateStr}T${String(checkOutHour).padStart(2, '0')}:${String(checkOutMinute).padStart(2, '0')}:00`,
              lat_in: 14.5995 + (Math.random() - 0.5) * 0.01,
              lng_in: 120.9842 + (Math.random() - 0.5) * 0.01,
              lat_out: 14.5995 + (Math.random() - 0.5) * 0.01,
              lng_out: 120.9842 + (Math.random() - 0.5) * 0.01,
              address_in: '123 Business Street, Manila',
              address_out: '123 Business Street, Manila',
              status: checkInMinute > 15 ? 'late' : 'present'
            })
            .select()
        }
      }
    }

    // 5. Create Announcements
    const adminUser = results.created_users.find(u => u.role === 'super_admin')
    if (adminUser) {
      const { data: adminEmployee } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('email', adminUser.email)
        .single()

      if (adminEmployee) {
        const announcements = [
          {
            title: 'Welcome to B1G HRIS',
            content: 'Welcome to our new Human Resources Information System! This platform will help streamline attendance tracking, leave management, and other HR processes.',
            author_id: adminEmployee.id,
            is_pinned: true
          },
          {
            title: 'Holiday Notice',
            content: 'Please be reminded that the office will be closed on March 25, 2026 in observance of a national holiday.',
            author_id: adminEmployee.id,
            is_pinned: true
          }
        ]

        const { data: announcementData } = await supabaseClient
          .from('announcements')
          .insert(announcements)
          .select()

        results.announcements = announcementData
      }
    }

    return new Response(
      JSON.stringify(results),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
