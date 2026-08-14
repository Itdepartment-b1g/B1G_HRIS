import { encryptText, randomToken, sanitizeAppOrigin, sha256Hex } from './passwordChangeCrypto.ts'
import { sendPasswordChangeRequestEmails, type PasswordChangeSource } from './passwordChangeEmail.ts'

const EXPIRY_MINUTES = 30

export async function createPendingPasswordChange(
  supabaseClient: any,
  opts: {
    employee: {
      id: string
      email: string
      first_name?: string | null
      last_name?: string | null
      employee_code?: string | null
    }
    newPassword: string
    latitude: number
    longitude: number
    selfie: string
    source: PasswordChangeSource
    userAgent?: string
    appOrigin?: string
  }
): Promise<{ token: string }> {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const newPasswordEnc = await encryptText(opts.newPassword)
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString()

  await supabaseClient
    .from('password_change_requests')
    .delete()
    .eq('employee_id', opts.employee.id)
    .is('consumed_at', null)

  const { error } = await supabaseClient.from('password_change_requests').insert({
    employee_id: opts.employee.id,
    token_hash: tokenHash,
    new_password_enc: newPasswordEnc,
    selfie: opts.selfie,
    latitude: opts.latitude,
    longitude: opts.longitude,
    source: opts.source,
    user_agent: opts.userAgent ?? null,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('password_change_requests insert error:', error)
    throw new Error('Unable to create password change request. Run the password-change-confirm migration.')
  }

  const origin = sanitizeAppOrigin(opts.appOrigin)
  const confirmUrl = `${origin}/confirm-password-change?token=${token}`
  const storedEmail = (opts.employee.email ?? '').trim().toLowerCase()

  await sendPasswordChangeRequestEmails({
    toEmail: storedEmail,
    firstName: opts.employee.first_name ?? '',
    lastName: opts.employee.last_name ?? '',
    employeeCode: opts.employee.employee_code ?? '',
    latitude: opts.latitude,
    longitude: opts.longitude,
    selfie: opts.selfie,
    source: opts.source,
    confirmUrl,
    userAgent: opts.userAgent,
  })

  return { token }
}
