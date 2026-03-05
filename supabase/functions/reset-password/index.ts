// Edge Function: Reset Password
// Deploy: supabase functions deploy reset-password

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

    const { user_id, email, new_password } = await req.json()

    // Must provide either user_id or email
    if (!user_id && !email) {
      return new Response(
        JSON.stringify({ error: 'Must provide either user_id or email' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    // Must provide new password
    if (!new_password) {
      return new Response(
        JSON.stringify({ error: 'new_password is required' }),
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
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
