// Edge Function: Create User
// Deploy: supabase functions deploy create-user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    const { 
      email, 
      password, 
      employee_code, 
      first_name, 
      last_name, 
      phone, 
      department, 
      position,
      role = 'employee',
      hired_date
    } = await req.json()

    // Validate required fields
    if (!email || !password || !employee_code || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, employee_code, first_name, last_name' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Create auth user
    const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        employee_code,
        first_name,
        last_name,
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: authError.message }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Update employee profile
    const { error: employeeError } = await supabaseClient
      .from('employees')
      .update({
        employee_code,
        first_name,
        last_name,
        email,
        phone: phone || null,
        department: department || null,
        position: position || null,
        hired_date: hired_date || null,
        is_active: true,
      })
      .eq('id', authUser.user.id)

    if (employeeError) {
      console.error('Employee update error:', employeeError)
      // Don't fail the whole operation, employee was created by trigger
    }

    // Assign role if not default
    if (role !== 'employee') {
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .update({ role })
        .eq('user_id', authUser.user.id)

      if (roleError) {
        console.error('Role assignment error:', roleError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: authUser.user.id,
          email: authUser.user.email,
          employee_code,
          first_name,
          last_name,
          role
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 201 
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
