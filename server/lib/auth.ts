import type { Request } from 'express';
import { createUserClient } from './supabase.js';

export interface AuthUser {
  userId: string;
}

/**
 * Verify Supabase session JWT from Authorization: Bearer <token>.
 */
export async function verifyUserJwt(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) return null;

  const client = createUserClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;

  return { userId: data.user.id };
}
