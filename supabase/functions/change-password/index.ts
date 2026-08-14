// Edge Function: Change Password (authenticated)
// Deploy: supabase functions deploy change-password
// Creates a pending request and emails a Confirm link. Password is not
// changed until confirm-password-change is called.
// Secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, verifyUserJwt } from './auth.ts'
import { changePasswordSchema, validateOr400, ValidationError } from './validation.ts'
import { createPendingPasswordChange } from '../_shared/createPendingPasswordChange.ts'

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

    try {
      await createPendingPasswordChange(supabaseClient, {
        employee,
        newPassword: parsed.new_password,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        selfie: parsed.selfie,
        source: 'settings',
        userAgent: parsed.user_agent,
        appOrigin: parsed.app_origin,
      })
    } catch (emailErr) {
      console.error('Change password pending/email error:', emailErr)
      return new Response(
        JSON.stringify({
          error: emailErr instanceof Error ? emailErr.message : 'Could not send confirmation email.',
        }),
        { headers, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check your email and click Confirm password update. Your password will not change until you confirm.',
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
