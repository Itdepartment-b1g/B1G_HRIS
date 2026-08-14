// Edge Function: Forgot Password (unauthenticated)
// Deploy: supabase functions deploy forgot-password
// Creates a pending request and emails a Confirm link. Password is not
// changed until confirm-password-change is called.
// Secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './auth.ts'
import { forgotPasswordSchema, validateOr400, ValidationError } from './validation.ts'
import { createPendingPasswordChange } from '../_shared/createPendingPasswordChange.ts'

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

    try {
      await createPendingPasswordChange(supabaseClient, {
        employee,
        newPassword: parsed.new_password,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        selfie: parsed.selfie,
        source: 'forgot_password',
        userAgent: parsed.user_agent,
        appOrigin: parsed.app_origin,
      })
    } catch (emailErr) {
      console.error('Forgot password pending/email error:', emailErr)
      return new Response(
        JSON.stringify({
          error: emailErr instanceof Error ? emailErr.message : 'Could not send confirmation email.',
        }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check your email and click Confirm password update. Your password will not change until you confirm.',
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
