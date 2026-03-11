/**
 * Shared auth helpers for Edge Functions.
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
