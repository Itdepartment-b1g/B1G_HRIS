import { createClient } from '@supabase/supabase-js';

// Trim avoids CRLF (\r) from Windows .env files corrupting URL / anon key (breaks Edge Function JWT verification).
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** When auth fails (SIGNED_OUT, refresh failure), clear session tracking and redirect to login */
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      const suppressRedirect = (window as any).__B1G_SUPPRESS_AUTH_REDIRECT__;
      if (!suppressRedirect) {
        localStorage.removeItem('b1g_session_id');
      }
      // Debug-friendly behavior:
      // Don't force a redirect/sign-out reload during edge calls while diagnosing.
      // UI will react to `session` being null, but the console will remain intact.
      // (You can re-enable redirect once the root cause is confirmed.)
      console.warn('[auth] Session ended:', { event, pathname: window.location.pathname, suppressRedirect });
    }
  });
}
