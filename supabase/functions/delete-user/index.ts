// Edge Function: Delete User
// Deploy: supabase functions deploy delete-user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const { user_id } = await req.json()

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Clear supervisor references pointing to this user first
    await supabaseClient
      .from('employees')
      .update({ supervisor_id: null })
      .eq('supervisor_id', user_id)

    // Clear department head references
    await supabaseClient
      .from('departments')
      .update({ head_id: null })
      .eq('head_id', user_id)

    // Delete from auth.users — cascades to employees and user_roles
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user_id)

    if (deleteError) {
      console.error('Delete user error:', deleteError)
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${user_id} deleted successfully`,
        user_id
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
