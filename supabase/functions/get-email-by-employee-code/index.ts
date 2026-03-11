// Edge Function: Get email by employee code (for login)
// Deploy: supabase functions deploy get-email-by-employee-code

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req)(req) })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { employee_code } = await req.json()

    if (!employee_code || typeof employee_code !== 'string') {
      return new Response(
        JSON.stringify({ error: 'employee_code is required' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { data, error } = await supabaseClient
      .from('employees')
      .select('email')
      .eq('employee_code', employee_code.trim())
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Lookup error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!data?.email) {
      return new Response(
        JSON.stringify({ error: 'Invalid employee code' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    return new Response(
      JSON.stringify({ email: data.email }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
