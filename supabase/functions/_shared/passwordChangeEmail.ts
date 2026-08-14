/**
 * Email notice after a password change (forgot-password or Settings).
 * Requires secrets: GMAIL_USER, GMAIL_PASSWORD
 */

import nodemailer from 'npm:nodemailer@6.9.10'

export type PasswordChangeSource = 'forgot_password' | 'settings'

const MAX_SELFIE_BYTES = 1_500_000

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function parseSelfieDataUrl(selfie: string): {
  mime: string
  bytes: Uint8Array
  filename: string
  base64: string
} {
  const match = selfie.trim().match(/^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) {
    throw new Error('Selfie must be a JPEG or PNG image')
  }
  const mime = match[1]!.toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1]!.toLowerCase()
  const b64 = match[2]!.replace(/\s/g, '')
  const binary = atob(b64)
  if (binary.length > MAX_SELFIE_BYTES) {
    throw new Error('Selfie is too large. Please retake the photo.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const filename = mime === 'image/png' ? 'selfie.png' : 'selfie.jpg'
  return { mime, bytes, filename, base64: b64 }
}

export async function sendPasswordChangeEmail(opts: {
  toEmail: string
  firstName: string
  lastName: string
  employeeCode: string
  latitude: number
  longitude: number
  selfie: string
  source: PasswordChangeSource
  userAgent?: string
}): Promise<void> {
  const gmailUser = Deno.env.get('GMAIL_USER')
  const gmailPass = Deno.env.get('GMAIL_PASSWORD')
  if (!gmailUser || !gmailPass) {
    console.warn('GMAIL_USER or GMAIL_PASSWORD not set - skipping password-change email')
    return
  }

  const selfie = parseSelfieDataUrl(opts.selfie)
  const when = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const lat = opts.latitude.toFixed(6)
  const lng = opts.longitude.toFixed(6)
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
  const sourceLabel = opts.source === 'forgot_password' ? 'Forgot password (login page)' : 'Settings'
  const name = `${opts.firstName} ${opts.lastName}`.trim() || 'there'
  const appUrl = 'https://b1ghris.vercel.app/'
  const buttonColor = '#7C3AED'

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Your B1G HRIS password was changed</h2>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;">A password change was completed on your account. Here are the details of this request:</p>

      <p style="margin:0 0 8px;font-weight:bold;">Selfie</p>
      <p style="margin:0 0 20px;">
        <img src="cid:selfie" alt="Password change selfie" width="280" style="display:block;max-width:100%;border-radius:8px;border:1px solid #e5e5e5;" />
      </p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Employee code</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(opts.employeeCode)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>When</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(when)} (Philippine time)</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Requested from</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(sourceLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Latitude</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:Consolas,monospace;">${lat}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Longitude</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:Consolas,monospace;">${lng}</td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td align="center" bgcolor="${buttonColor}" style="border-radius:8px;">
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">
              View map
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;">If this was you, no further action is needed. Sign in:
        <a href="${appUrl}" target="_blank" rel="noopener noreferrer">${appUrl}</a>
      </p>
      <p style="margin:0 0 16px;"><strong>If you did not change your password, contact HR immediately.</strong></p>
      <p style="margin:0;color:#555;">— B1G HR Team</p>
    </div>
  `

  const text = [
    `Hi ${name},`,
    '',
    'A password change was completed on your B1G HRIS account.',
    `Employee code: ${opts.employeeCode}`,
    `When: ${when} (Philippine time)`,
    `Where it was requested: ${sourceLabel}`,
    `Latitude: ${lat}`,
    `Longitude: ${lng}`,
    `View map: ${mapsUrl}`,
    opts.userAgent ? `Device: ${opts.userAgent.slice(0, 240)}` : '',
    '',
    'If this was not you, contact HR immediately.',
    `Sign in: ${appUrl}`,
    '',
    '— B1G HR Team',
  ].filter((line) => line !== '').join('\n')

  const employeeEmail = opts.toEmail.trim().toLowerCase()
  const companyEmail = gmailUser.trim().toLowerCase()

  const detailsHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Password change details</h2>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(name)}</strong> (${escapeHtml(opts.employeeCode)}) changed their B1G HRIS password.</p>

      <p style="margin:0 0 8px;font-weight:bold;">Selfie</p>
      <p style="margin:0 0 20px;">
        <img src="cid:selfie" alt="Password change selfie" width="280" style="display:block;max-width:100%;border-radius:8px;border:1px solid #e5e5e5;" />
      </p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Employee email</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(employeeEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>When</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(when)} (Philippine time)</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Requested from</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(sourceLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Latitude</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:Consolas,monospace;">${lat}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Longitude</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:Consolas,monospace;">${lng}</td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td align="center" bgcolor="${buttonColor}" style="border-radius:8px;">
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">
              View map
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0;color:#555;">— B1G HRIS</p>
    </div>
  `

  const detailsText = [
    `${name} (${opts.employeeCode}) changed their B1G HRIS password.`,
    `Employee email: ${employeeEmail}`,
    `When: ${when} (Philippine time)`,
    `Where it was requested: ${sourceLabel}`,
    `Latitude: ${lat}`,
    `Longitude: ${lng}`,
    `View map: ${mapsUrl}`,
    opts.userAgent ? `Device: ${opts.userAgent.slice(0, 240)}` : '',
  ].filter((line) => line !== '').join('\n')

  const selfieAttachment = {
    filename: selfie.filename,
    content: selfie.base64,
    encoding: 'base64',
    contentType: selfie.mime,
    cid: 'selfie',
    contentDisposition: 'inline',
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: gmailPass },
  })

  const send = (optsMail: Record<string, unknown>) =>
    new Promise<void>((resolve, reject) => {
      transport.sendMail(optsMail, (err: Error | null) => (err ? reject(err) : resolve()))
    })

  await send({
    from: gmailUser,
    to: employeeEmail,
    subject: 'Your B1G HRIS password was changed',
    html,
    text,
    attachments: [selfieAttachment],
  })

  if (companyEmail && companyEmail !== employeeEmail) {
    await send({
      from: gmailUser,
      to: companyEmail,
      subject: `Password change details: ${opts.employeeCode} ${name}`,
      html: detailsHtml,
      text: detailsText,
      attachments: [selfieAttachment],
    })
  }
}
