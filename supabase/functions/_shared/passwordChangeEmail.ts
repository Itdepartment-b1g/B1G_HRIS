/**
 * Emails for password-change requests.
 * Employee gets a Confirm button. Company gets selfie + GPS details.
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

function requireGmail(): { user: string; pass: string } {
  const user = Deno.env.get('GMAIL_USER')
  const pass = Deno.env.get('GMAIL_PASSWORD')
  if (!user || !pass) {
    throw new Error('Email is not configured. Set GMAIL_USER and GMAIL_PASSWORD secrets.')
  }
  return { user, pass }
}

export async function sendPasswordChangeRequestEmails(opts: {
  toEmail: string
  firstName: string
  lastName: string
  employeeCode: string
  latitude: number
  longitude: number
  selfie: string
  source: PasswordChangeSource
  confirmUrl: string
  userAgent?: string
}): Promise<void> {
  const { user: gmailUser, pass: gmailPass } = requireGmail()
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
  const buttonColor = '#7C3AED'
  const employeeEmail = opts.toEmail.trim().toLowerCase()
  const companyEmail = gmailUser.trim().toLowerCase()

  const confirmBtn = `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
      <tr>
        <td align="center" bgcolor="${buttonColor}" style="border-radius:8px;">
          <a href="${escapeHtml(opts.confirmUrl)}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">
            Confirm password update
          </a>
        </td>
      </tr>
    </table>
  `
  const mapBtn = `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" bgcolor="#111827" style="border-radius:8px;">
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">
            View map
          </a>
        </td>
      </tr>
    </table>
  `

  const detailsTable = `
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
  `

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Confirm your B1G HRIS password update</h2>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;">Someone requested a password change on your account. Your password will <strong>not</strong> change until you click the button below. This link expires in 30 minutes.</p>

      ${confirmBtn}

      <p style="margin:16px 0 8px;font-weight:bold;">Selfie</p>
      <p style="margin:0 0 20px;">
        <img src="cid:selfie" alt="Password change selfie" width="280" style="display:block;max-width:100%;border-radius:8px;border:1px solid #e5e5e5;" />
      </p>
      ${detailsTable}
      ${mapBtn}
      <p style="margin:0 0 16px;"><strong>If this was not you, ignore this email. Your current password stays the same.</strong></p>
      <p style="margin:0;color:#555;">— B1G HR Team</p>
    </div>
  `

  const text = [
    `Hi ${name},`,
    '',
    'Confirm your B1G HRIS password update. Your password will not change until you open this link:',
    opts.confirmUrl,
    '',
    `Employee code: ${opts.employeeCode}`,
    `When: ${when} (Philippine time)`,
    `Latitude: ${lat}`,
    `Longitude: ${lng}`,
    `View map: ${mapsUrl}`,
    '',
    'If this was not you, ignore this email. Your current password stays the same.',
    '',
    '— B1G HR Team',
  ].join('\n')

  const detailsHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Password change requested (awaiting confirmation)</h2>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(name)}</strong> (${escapeHtml(opts.employeeCode)}) requested a password change. It is not applied until they confirm in email.</p>
      <p style="margin:0 0 8px;font-weight:bold;">Selfie</p>
      <p style="margin:0 0 20px;">
        <img src="cid:selfie" alt="Password change selfie" width="280" style="display:block;max-width:100%;border-radius:8px;border:1px solid #e5e5e5;" />
      </p>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Employee email</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(employeeEmail)}</td>
        </tr>
      </table>
      ${detailsTable}
      ${mapBtn}
      <p style="margin:0;color:#555;">— B1G HRIS</p>
    </div>
  `

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

  const send = (mail: Record<string, unknown>) =>
    new Promise<void>((resolve, reject) => {
      transport.sendMail(mail, (err: Error | null) => (err ? reject(err) : resolve()))
    })

  await send({
    from: gmailUser,
    to: employeeEmail,
    subject: 'Confirm your B1G HRIS password update',
    html,
    text,
    attachments: [selfieAttachment],
  })

  if (companyEmail && companyEmail !== employeeEmail) {
    await send({
      from: gmailUser,
      to: companyEmail,
      subject: `Password change requested: ${opts.employeeCode} ${name}`,
      html: detailsHtml,
      text: `${name} (${opts.employeeCode}) requested a password change (awaiting confirmation).\nEmail: ${employeeEmail}\nLatitude: ${lat}\nLongitude: ${lng}\nView map: ${mapsUrl}`,
      attachments: [selfieAttachment],
    })
  }
}
