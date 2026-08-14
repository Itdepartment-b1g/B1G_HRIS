// Edge Function: Forgot Password (unauthenticated)
// Deploy: supabase functions deploy forgot-password
// Verifies employee code + email, requires selfie + location, then sets a new password
// and emails the verification details. Secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './auth.ts'
import { forgotPasswordSchema, validateOr400, ValidationError } from './validation.ts'
import { sendPasswordChangeEmail } from '../_shared/passwordChangeEmail.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const body = await req.json()
    let parsed
    try {
      parsed = validateOr400(forgotPasswordSchema, body)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof ValidationError ? e.message : 'Invalid request body' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const employeeCode = parsed.employee_code
    const email = parsed.email.trim().toLowerCase()
    const newPassword = parsed.new_password

    const { data: employee, error: lookupError } = await supabaseClient
      .from('employees')
      .select('id, email, is_active, first_name, last_name, employee_code')
      .eq('employee_code', employeeCode)
      .maybeSingle()

    if (lookupError) {
      console.error('Forgot password lookup error:', lookupError)
      return new Response(
        JSON.stringify({ error: 'Unable to reset password. Please try again.' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const storedEmail = (employee?.email ?? '').trim().toLowerCase()
    if (!employee || !employee.is_active || storedEmail !== email) {
      return new Response(
        JSON.stringify({ error: 'Employee code and email do not match.' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      employee.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Forgot password update error:', updateError)
      return new Response(
        JSON.stringify({ error: updateError.message || 'Failed to update password' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    try {
      await sendPasswordChangeEmail({
        toEmail: storedEmail,
        firstName: employee.first_name ?? '',
        lastName: employee.last_name ?? '',
        employeeCode: employee.employee_code ?? employeeCode,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        selfie: parsed.selfie,
        source: 'forgot_password',
        userAgent: parsed.user_agent,
      })
    } catch (emailErr) {
      console.error('Forgot password email error:', emailErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated. A confirmation with your selfie and location was sent to your email.',
      }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
