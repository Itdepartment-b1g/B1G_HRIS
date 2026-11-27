// Sends queued probationary evaluation emails once.
// Deploy: supabase functions deploy send-performance-emails
// Requires secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.10'

const CONFIDENTIALITY = [
  'The information contained in this email and any attachments is confidential and intended solely for the use of the individual or entity to whom it is addressed and other authorized recipients.',
  'If you are not the intended recipient, please notify the sender immediately and delete this email. Do not disclose, copy, or use any information contained herein.',
].join(' ')

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

async function callerIsAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (serviceKey && token === serviceKey) return true

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false
  const { data } = await userClient.from('user_roles').select('role').eq('user_id', user.id)
  return (data ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin')
}

async function sendEmail(to: string[], subject: string, lines: string[]): Promise<void> {
  const gmailUser = Deno.env.get('GMAIL_USER')
  const gmailPass = Deno.env.get('GMAIL_PASSWORD')
  if (to.length === 0) return
  if (!gmailUser || !gmailPass) throw new Error('GMAIL_USER or GMAIL_PASSWORD not set')
  const body = lines.map((line) => `<li>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')
  const html = `<p style="font-family:Arial,sans-serif;font-size:14px;">${subject}</p><ul style="font-family:Arial,sans-serif;font-size:14px;">${body}</ul><p style="font-family:Arial,sans-serif;font-size:11px;color:#666;">${CONFIDENTIALITY}</p>`
  const text = `${subject}\n\n${lines.map((line) => `- ${line}`).join('\n')}\n\n${CONFIDENTIALITY}`
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: gmailPass },
  })
  await new Promise<void>((resolve, reject) => {
    transport.sendMail({ from: gmailUser, to: to.join(', '), subject, html, text }, (err: unknown) => (err ? reject(err) : resolve()))
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    if (!(await callerIsAdmin(req))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: rows, error } = await supabase
      .from('performance_email_outbox')
      .select('id, kind, subject, line, recipient_emails')
      .is('sent_at', null)
      .order('created_at', { ascending: true })
    if (error) throw error

    const pending = rows ?? []
    const kinds = ['created', 'needs_create'] as const
    let sent = 0

    for (const kind of kinds) {
      const items = pending.filter((row) => row.kind === kind)
      if (items.length === 0) continue
      const emails = [...new Set(items.flatMap((row) => (row.recipient_emails ?? []).filter(Boolean)))]
      const subject = items[0].subject as string
      const lines = items.map((row) => row.line as string)
      if (emails.length > 0) await sendEmail(emails, subject, lines)
      const { error: markError } = await supabase
        .from('performance_email_outbox')
        .update({ sent_at: new Date().toISOString() })
        .in('id', items.map((row) => row.id))
      if (markError) throw markError
      sent += items.length
    }

    return new Response(JSON.stringify({ success: true, sent }), { headers, status: 200 })
  } catch (error) {
    console.error('send-performance-emails error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send' }), { headers, status: 500 })
  }
})
