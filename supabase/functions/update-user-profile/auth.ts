/**
 * Shared auth helpers for Edge Functions.
 * Verifies JWT and enforces admin/super_admin role for privileged operations.
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
  if (error) {
    console.error('[verifyUserJwt] getUser error:', error.message)
    return null
  }
  if (!user) return null

  const { data: rolesData } = await userClient.from('user_roles').select('role').eq('user_id', user.id)
  const roles = (rolesData ?? []).map((r) => r.role)

  return { userId: user.id, roles }
}

export function requireAdmin(auth: AuthResult | null, req: Request): Response | null {
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
  }
  const isAdmin = auth.roles.includes('admin') || auth.roles.includes('super_admin')
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or super_admin role required' }),
      { headers, status: 403 }
    )
  }
  return null
}

export function requireSuperAdmin(auth: AuthResult | null, req: Request): Response | null {
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
  }
  if (!auth.roles.includes('super_admin')) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: super_admin role required' }),
      { headers, status: 403 }
    )
  }
  return null
}
