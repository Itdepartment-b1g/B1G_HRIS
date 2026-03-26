/**
 * TypeScript shims for Supabase Edge Functions (Deno runtime).
 *
 * Cursor/TS often reports errors for:
 * - remote URL imports (esm.sh / deno.land)
 * - `Deno` global being unknown
 *
 * These shims intentionally type those modules as `any` since the runtime
 * types are handled by Supabase/Deno during execution.
 */

// Make `Deno.env.get()` available to the type-checker.
// This is enough to satisfy the diagnostics we're seeing.
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(...args: any[]): any;
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: any): void;
}

declare module 'npm:nodemailer@6.9.10' {
  const nodemailer: any;
  export default nodemailer;
}

