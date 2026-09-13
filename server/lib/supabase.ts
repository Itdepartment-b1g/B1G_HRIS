import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requiredEnv(name: string, fallbackName?: string): string {
  const value = (process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined) ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!value) {
    throw new Error(`Missing required env: ${name}${fallbackName ? ` (or ${fallbackName})` : ''}`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
}

export function getSupabaseAnonKey(): string {
  return requiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
}

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createServiceClient(): SupabaseClient {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!serviceKey) {
    throw new Error('Missing required env: SUPABASE_SERVICE_ROLE_KEY');
  }

  // Opaque sb_secret_ keys are not JWTs. supabase-js also sends them as
  // Authorization: Bearer, and PostgREST then returns Invalid JWT / 500.
  const stripBearerForOpaqueSecret = serviceKey.startsWith('sb_secret_')
    ? {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('apikey', serviceKey);
          headers.delete('Authorization');
          return fetch(input, { ...init, headers });
        },
      }
    : undefined;

  return createClient(getSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: stripBearerForOpaqueSecret,
  });
}
