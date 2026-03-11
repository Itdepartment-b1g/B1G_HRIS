// Edge Function: Reset Password
// Deploy: supabase functions deploy reset-password

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, verifyUserJwt, requireAdmin } from './auth.ts'
import { resetPasswordSchema, validateOr400, ValidationError } from './validation.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const auth = await verifyUserJwt(req)
    const forbidden = requireAdmin(auth, req)
    if (forbidden) return forbidden

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

    const body = await req.json()
    let parsed
    try {
      parsed = validateOr400(resetPasswordSchema, body)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof ValidationError ? e.message : 'Invalid request body' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { user_id, email, new_password } = parsed

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
            headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
            status: 404 
          }
        )
      }
      targetUserId = userData.id
    }

    // Update user password
    const { data, error } = await supabaseClient.auth.admin.updateUserById(
      targetUserId,
      { password: new_password }
    )

    if (error) {
      console.error('Password reset error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password reset successfully',
        user_id: data.user.id
      }),
      { 
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
