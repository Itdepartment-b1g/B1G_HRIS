// Sends queued exit-clearance emails.
// Deploy: supabase functions deploy send-clearance-emails
// Requires secrets: GMAIL_USER, GMAIL_PASSWORD
// Optional: APP_PUBLIC_URL (defaults to the live HRIS site)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.10'

const CONFIDENTIALITY_PARAGRAPHS = [
  'The information contained in this email and any attachments is confidential and intended solely for the use of the individual or entity to whom it is addressed and other authorized recipients. It may contain confidential employee or company information and should not be disclosed, copied, distributed, or used by any unauthorized person.',
  'If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments from your system. If you have received this email in error, please do not disclose, copy, or use any information contained herein.',
  'B1G Corporation does not guarantee the proper or complete transmission of this communication or the timely receipt of the information contained herein. B1G Corporation shall not be held liable for any damage arising from the transmission of this email or its attachments, including damage caused by viruses, unauthorized access, interception, or other security-related incidents.',
]

function corsHeaders(req: Request): Record<string, string> {
  const allowed = Deno.env.get('ALLOWED_ORIGINS')
  const origin = req.headers.get('Origin') ?? ''
  const allowedList = allowed?.split(',').map((o) => o.trim()).filter(Boolean)
  const allowOrigin = allowedList?.length
    ? (allowedList.includes(origin) ? origin : (allowedList[0] ?? '*'))
    : '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appendConfidentialityHtml(html: string): string {
  const paragraphs = CONFIDENTIALITY_PARAGRAPHS.map(
    (paragraph, index) =>
      `<p style="margin:0 0 ${index === CONFIDENTIALITY_PARAGRAPHS.length - 1 ? '0' : '8px'};">${paragraph}</p>`
  ).join('')
  const footer = `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-collapse:collapse;">
  <tr>
    <td bgcolor="#FFF59D" style="background-color:#FFF59D;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#333333;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:bold;">CONFIDENTIALITY NOTICE</p>
      ${paragraphs}
    </td>
  </tr>
</table>`
  return `${html.trimEnd()}\n${footer}`
}

function appendConfidentialityText(text: string): string {
  return `${text.trimEnd()}\n\nCONFIDENTIALITY NOTICE\n\n${CONFIDENTIALITY_PARAGRAPHS.join('\n\n')}`
}

async function callerMaySend(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const apiKey = req.headers.get('apikey') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (serviceKey && (bearer === serviceKey || apiKey === serviceKey)) return true
  if (!authHeader.startsWith('Bearer ')) return false

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
  const { data: { user } } = await userClient.auth.getUser()
  return !!user
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const gmailUser = Deno.env.get('GMAIL_USER')
  const gmailPass = Deno.env.get('GMAIL_PASSWORD')
  if (!gmailUser || !gmailPass) throw new Error('GMAIL_USER or GMAIL_PASSWORD not set')
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: gmailPass },
  })
  await new Promise<void>((resolve, reject) => {
    transport.sendMail(
      {
        from: gmailUser,
        to,
        subject,
        html: appendConfidentialityHtml(html),
        text: appendConfidentialityText(text),
      },
      (err: unknown) => (err ? reject(err) : resolve())
    )
  })
}

function appLink(actionUrl: string | null): string {
  const base = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://b1ghris.vercel.app').replace(/\/+$/, '')
  if (actionUrl?.startsWith('/')) return `${base}${actionUrl}`
  return `${base}/dashboard/offboarding`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    if (!(await callerMaySend(req))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: rows, error } = await supabase
      .from('clearance_email_outbox')
      .select('id, email, subject, body, action_url')
      .is('sent_at', null)
      .order('created_at', { ascending: true })
      .limit(40)
    if (error) throw error

    let sent = 0
    for (const row of rows ?? []) {
      const claimedAt = new Date().toISOString()
      const { data: claimed, error: claimError } = await supabase
        .from('clearance_email_outbox')
        .update({ sent_at: claimedAt })
        .eq('id', row.id)
        .is('sent_at', null)
        .select('id')
      if (claimError) throw claimError
      if (!claimed?.length) continue

      const link = appLink(row.action_url)
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">
        <p style="margin:0 0 12px;">${escapeHtml(row.body)}</p>
        <p style="margin:0 0 16px;"><a href="${escapeHtml(link)}" style="color:#472160;">Open the exit clearance</a></p>
      </div>`
      const text = `${row.body}\n\nOpen the exit clearance: ${link}`

      try {
        await sendEmail(row.email, row.subject, html, text)
        sent += 1
      } catch (sendError) {
        console.error('clearance email failed:', row.id, sendError)
        await supabase.from('clearance_email_outbox').update({ sent_at: null }).eq('id', row.id)
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), { headers, status: 200 })
  } catch (error) {
    console.error('send-clearance-emails error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send' }),
      { headers, status: 500 }
    )
  }
})
