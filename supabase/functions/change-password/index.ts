// Edge Function: Change Password (authenticated)
// Deploy: supabase functions deploy change-password
// Requires selfie + location, updates the signed-in user's password,
// and emails the verification details. Secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, verifyUserJwt } from './auth.ts'
import { changePasswordSchema, validateOr400, ValidationError } from './validation.ts'
import { sendPasswordChangeEmail } from '../_shared/passwordChangeEmail.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const auth = await verifyUserJwt(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
    }

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
      parsed = validateOr400(changePasswordSchema, body)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof ValidationError ? e.message : 'Invalid request body' }),
        { headers, status: 400 }
      )
    }

    const { data: employee, error: lookupError } = await supabaseClient
      .from('employees')
      .select('id, email, is_active, first_name, last_name, employee_code')
      .eq('id', auth.userId)
      .maybeSingle()

    if (lookupError) {
      console.error('Change password lookup error:', lookupError)
      return new Response(
        JSON.stringify({ error: 'Unable to change password. Please try again.' }),
        { headers, status: 500 }
      )
    }

    if (!employee || !employee.is_active) {
      return new Response(
        JSON.stringify({ error: 'Account is not active.' }),
        { headers, status: 400 }
      )
    }

    const storedEmail = (employee.email ?? '').trim().toLowerCase()
    if (!storedEmail) {
      return new Response(
        JSON.stringify({ error: 'No email on file for this account.' }),
        { headers, status: 400 }
      )
    }

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      employee.id,
      { password: parsed.new_password }
    )

    if (updateError) {
      console.error('Change password update error:', updateError)
      return new Response(
        JSON.stringify({ error: updateError.message || 'Failed to update password' }),
        { headers, status: 400 }
      )
    }

    try {
      await sendPasswordChangeEmail({
        toEmail: storedEmail,
        firstName: employee.first_name ?? '',
        lastName: employee.last_name ?? '',
        employeeCode: employee.employee_code ?? '',
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        selfie: parsed.selfie,
        source: 'settings',
        userAgent: parsed.user_agent,
      })
    } catch (emailErr) {
      console.error('Change password email error:', emailErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated. A confirmation with your selfie and location was sent to your email.',
      }),
      { headers, status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { headers, status: 500 }
    )
  }
})
