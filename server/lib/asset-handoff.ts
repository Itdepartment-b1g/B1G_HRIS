import jwt from 'jsonwebtoken';

export interface HandoffEmployee {
  id: string;
  employee_code: string;
  company_email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_active: boolean;
}

export interface HandoffPayload {
  hris_employee_id: string;
  employee_code: string;
  company_email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_active: boolean;
  exp: number;
}

const HANDOFF_TTL_SECONDS = 60;

function getHrisSsoSecret(): string {
  const secret = (process.env.HRIS_SSO_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('Missing required env: HRIS_SSO_SECRET');
  }
  return secret;
}

function getAssetAppUrl(): string {
  const url = (process.env.ASSET_APP_URL ?? '').trim().replace(/\/+$/, '');
  if (!url) {
    throw new Error('Missing required env: ASSET_APP_URL');
  }
  return url;
}

/**
 * Create a short-lived signed JWT handoff for Asset Management.
 * Payload contains only the agreed identity fields (no passwords / extra HR data).
 */
export function createAssetHandoffToken(employee: HandoffEmployee): { token: string; redirectUrl: string } {
  if (!employee.company_email?.trim()) {
    throw new Error('NO_COMPANY_EMAIL');
  }

  const payload = {
    hris_employee_id: employee.id,
    employee_code: employee.employee_code,
    company_email: employee.company_email.trim(),
    first_name: employee.first_name,
    middle_name: employee.middle_name,
    last_name: employee.last_name,
    is_active: employee.is_active,
  };

  const token = jwt.sign(payload, getHrisSsoSecret(), {
    algorithm: 'HS256',
    expiresIn: HANDOFF_TTL_SECONDS,
  });

  const redirectUrl = `${getAssetAppUrl()}/api/auth/hris/callback?token=${encodeURIComponent(token)}`;
  return { token, redirectUrl };
}
