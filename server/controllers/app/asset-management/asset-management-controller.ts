import type { Request, Response } from 'express';
import { verifyUserJwt } from '../../../lib/auth.js';
import { createAssetHandoffToken } from '../../../lib/asset-handoff.js';
import { getEmployeeForHandoff } from '../../../repositories/app/asset-management/employee-repository.js';

/**
 * Launch Asset Management with a short-lived SSO handoff token.
 * Requires an authenticated HRIS (Supabase) session.
 */
export async function launchAssetManagement(req: Request, res: Response): Promise<void> {
  try {
    const auth = await verifyUserJwt(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const employee = await getEmployeeForHandoff(auth.userId);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    if (!employee.is_active) {
      res.status(403).json({ error: 'Account is not active.' });
      return;
    }

    if (!employee.company_email?.trim()) {
      res.status(400).json({ error: 'No company email on file for this account.' });
      return;
    }

    const { redirectUrl } = createAssetHandoffToken(employee);
    res.status(200).json({ redirect_url: redirectUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    if (message.startsWith('Missing required env:')) {
      console.error('[asset-management] config error:', message);
      res.status(500).json({ error: 'Asset Management is not configured.' });
      return;
    }
    if (message === 'NO_COMPANY_EMAIL') {
      res.status(400).json({ error: 'No company email on file for this account.' });
      return;
    }
    console.error('[asset-management] launch error:', err);
    res.status(500).json({ error: 'Unable to open Asset Management. Please try again.' });
  }
}
