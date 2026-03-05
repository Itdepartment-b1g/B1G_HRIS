// Edge Function: Update User Profile
// Deploy: supabase functions deploy update-user-profile

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
      user_id,
      email,
      employee_code,
      first_name,
      last_name,
      phone,
      department,
      position,
      supervisor_id,
      is_active,
      hired_date,
      avatar_url,
      role
    } = await req.json()

    // Must provide user_id or email to identify the user
    if (!user_id && !email) {
      return new Response(
        JSON.stringify({ error: 'Must provide either user_id or email' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Find user by email if user_id not provided
    let targetUserId = user_id
    if (!targetUserId && email) {
      const { data: userData, error: userError } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('email', email)
        .single()

      if (userError || !userData) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 404 
          }
        )
      }
      targetUserId = userData.id
    }

    // Build update object (only include provided fields)
    const updateData: any = { updated_at: new Date().toISOString() }
    
    if (employee_code !== undefined) updateData.employee_code = employee_code
    if (first_name !== undefined) updateData.first_name = first_name
    if (last_name !== undefined) updateData.last_name = last_name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (department !== undefined) updateData.department = department
    if (position !== undefined) updateData.position = position
    if (supervisor_id !== undefined) updateData.supervisor_id = supervisor_id
    if (is_active !== undefined) updateData.is_active = is_active
    if (hired_date !== undefined) updateData.hired_date = hired_date
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url

    // Update employee profile
    const { data: employeeData, error: employeeError } = await supabaseClient
      .from('employees')
      .update(updateData)
      .eq('id', targetUserId)
      .select()
      .single()

    if (employeeError) {
      console.error('Employee update error:', employeeError)
      return new Response(
        JSON.stringify({ error: employeeError.message }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Update auth user email if changed
    if (email && email !== employeeData.email) {
      const { error: authError } = await supabaseClient.auth.admin.updateUserById(
        targetUserId,
        { email }
      )

      if (authError) {
        console.error('Auth email update error:', authError)
        // Don't fail the whole operation
      }
    }

    // Update user role if provided
    if (role) {
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .update({ role })
        .eq('user_id', targetUserId)

      if (roleError) {
        console.error('Role update error:', roleError)
        // Don't fail the whole operation
      }
    }

    // Fetch updated user with role
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .single()

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'User profile updated successfully',
        user: {
          ...employeeData,
          role: userRole?.role || 'employee'
        }
      }),
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
