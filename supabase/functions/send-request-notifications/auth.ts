/**
 * Auth helpers for send-request-notifications Edge Function.
 * Requires authenticated user (any role).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = Deno.env.get('ALLOWED_ORIGINS')
  const origin = req.headers.get('Origin') ?? ''
  const allowedList = allowed?.split(',').map((o) => o.trim()).filter(Boolean)
  const allowOrigin = allowedList?.length
    ? (allowedList.includes(origin) ? origin : (allowedList[0] ?? '*'))
    : '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  return getCorsHeaders(req)
}

export interface AuthResult {
  userId: string
  roles: string[]
}

/**
 * Verify request has valid user JWT. Returns null if auth fails.
 */
export async function verifyUserJwt(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null

  const { data: rolesData } = await userClient.from('user_roles').select('role').eq('user_id', user.id)
  const roles = (rolesData ?? []).map((r) => r.role)

  return { userId: user.id, roles }
}
