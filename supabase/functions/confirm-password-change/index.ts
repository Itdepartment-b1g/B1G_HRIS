// Edge Function: Confirm Password Change (unauthenticated, token from email)
// Deploy: supabase functions deploy confirm-password-change
// Applies the pending password only after the employee confirms.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './auth.ts'
import { confirmPasswordChangeSchema, validateOr400, ValidationError } from './validation.ts'
import { decryptText, sha256Hex } from '../_shared/passwordChangeCrypto.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const body = await req.json()
    let parsed
    try {
      parsed = validateOr400(confirmPasswordChangeSchema, body)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof ValidationError ? e.message : 'Invalid request body' }),
        { headers, status: 400 }
      )
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

    const tokenHash = await sha256Hex(parsed.token)
    const { data: requestRow, error: lookupError } = await supabaseClient
      .from('password_change_requests')
      .select('id, employee_id, new_password_enc, expires_at, consumed_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (lookupError) {
      console.error('Confirm password lookup error:', lookupError)
      return new Response(
        JSON.stringify({ error: 'Unable to confirm password change. Please try again.' }),
        { headers, status: 500 }
      )
    }

    if (!requestRow) {
      return new Response(
        JSON.stringify({ error: 'This confirmation link is invalid.' }),
        { headers, status: 400 }
      )
    }

    if (requestRow.consumed_at) {
      return new Response(
        JSON.stringify({ error: 'This confirmation link was already used.' }),
        { headers, status: 400 }
      )
    }

    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ error: 'This confirmation link has expired. Please request a new password change.' }),
        { headers, status: 400 }
      )
    }

    let newPassword: string
    try {
      newPassword = await decryptText(requestRow.new_password_enc)
    } catch (decErr) {
      console.error('Confirm password decrypt error:', decErr)
      return new Response(
        JSON.stringify({ error: 'Unable to confirm this request. Please request a new password change.' }),
        { headers, status: 400 }
      )
    }

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      requestRow.employee_id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Confirm password update error:', updateError)
      return new Response(
        JSON.stringify({ error: updateError.message || 'Failed to update password' }),
        { headers, status: 400 }
      )
    }

    await supabaseClient
      .from('password_change_requests')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', requestRow.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated. You can sign in with your new password now.',
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
