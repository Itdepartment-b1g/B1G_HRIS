import { supabase } from '@/lib/supabase';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

export interface LaunchAssetManagementResponse {
  redirect_url: string;
}

/**
 * Create a short-lived Asset Management SSO handoff and return the redirect URL.
 * Requires an active HRIS Supabase session.
 */
export async function launchAssetManagement(): Promise<LaunchAssetManagementResponse> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('You must be logged in to open Asset Management.');
  }

  const response = await fetch(apiUrl('/apps/asset-management/launch'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (body as { error?: string })?.error === 'string'
        ? (body as { error: string }).error
        : 'Unable to open Asset Management.';
    throw new Error(message);
  }

  const redirectUrl = (body as LaunchAssetManagementResponse).redirect_url;
  if (!redirectUrl) {
    throw new Error('Asset Management did not return a redirect URL.');
  }

  return { redirect_url: redirectUrl };
}
