// Edge Function: Send Request Notifications (Leave, OT, Business Trip)
// Deploy: supabase functions deploy send-request-notifications
// Requires secrets: GMAIL_USER, GMAIL_PASSWORD

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.10'
import { corsHeaders, verifyUserJwt } from './auth.ts'

interface Payload {
  event: 'submitted' | 'approved' | 'rejected'
  requestType: 'leave' | 'overtime' | 'business_trip'
  requestId: string
  approverId?: string
}

function getRequestTypeLabel(t: string): string {
  if (t === 'leave') return 'Leave'
  if (t === 'overtime') return 'Overtime'
  if (t === 'business_trip') return 'Business Trip'
  return t
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  text: string,
  replyTo?: string
): Promise<void> {
  const gmailUser = Deno.env.get('GMAIL_USER')
  const gmailPass = Deno.env.get('GMAIL_PASSWORD')
  if (!gmailUser || !gmailPass) {
    console.warn('GMAIL_USER or GMAIL_PASSWORD not set - skipping email')
    return
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: gmailPass },
  })
  const opts: Record<string, unknown> = {
    from: gmailUser,
    to: to.filter(Boolean).join(', '),
    subject,
    html,
    text,
  }
  if (replyTo) opts.replyTo = replyTo
  await new Promise<void>((resolve, reject) => {
    transport.sendMail(opts, (err) => (err ? reject(err) : resolve()))
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const auth = await verifyUserJwt(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers, status: 401 })
    }

    let body: Payload
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { headers, status: 400 })
    }

    const { event, requestType, requestId, approverId } = body
    if (!event || !requestType || !requestId) {
      return new Response(
        JSON.stringify({ error: 'Missing event, requestType, or requestId' }),
        { headers, status: 400 }
      )
    }
    if (!['submitted', 'approved', 'rejected'].includes(event)) {
      return new Response(JSON.stringify({ error: 'Invalid event' }), { headers, status: 400 })
    }
    if (!['leave', 'overtime', 'business_trip'].includes(requestType)) {
      return new Response(JSON.stringify({ error: 'Invalid requestType' }), { headers, status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Fetch request details and requestor
    let requestRec: Record<string, unknown> | null = null
    let employeeId: string

    if (requestType === 'leave') {
      const { data } = await supabase
        .from('leave_requests')
        .select('*, employee:employees!employee_id(id, first_name, last_name, email)')
        .eq('id', requestId)
        .single()
      requestRec = data as Record<string, unknown> | null
      employeeId = (requestRec?.employee_id as string) ?? ''
    } else if (requestType === 'overtime') {
      const { data } = await supabase
        .from('overtime_requests')
        .select('*, employee:employees!employee_id(id, first_name, last_name, email)')
        .eq('id', requestId)
        .single()
      requestRec = data as Record<string, unknown> | null
      employeeId = (requestRec?.employee_id as string) ?? ''
    } else {
      const { data } = await supabase
        .from('business_trips')
        .select('*, employee:employees!employee_id(id, first_name, last_name, email)')
        .eq('id', requestId)
        .single()
      requestRec = data as Record<string, unknown> | null
      employeeId = (requestRec?.employee_id as string) ?? ''
    }

    if (!requestRec || !employeeId) {
      return new Response(JSON.stringify({ error: 'Request not found' }), { headers, status: 404 })
    }

    const emp = requestRec.employee as { first_name?: string; last_name?: string; email?: string } | null
    const reqName = emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Employee' : 'Employee'
    const reqEmail = emp?.email || ''

    // 2. Fetch company profile for Reply-To
    const { data: cp } = await supabase.from('company_profile').select('email, name').limit(1).maybeSingle()
    const companyEmail = (cp as { email?: string } | null)?.email
    const companyName = (cp as { name?: string } | null)?.name || 'B1G HRIS'

    // 3. Build request summary for email body
    let summary = ''
    if (requestType === 'leave') {
      const lr = requestRec as { leave_type?: string; start_date?: string; end_date?: string; number_of_days?: number; reason?: string }
      summary = `Leave type: ${lr.leave_type || '—'}\nDates: ${lr.start_date || '—'} to ${lr.end_date || '—'}\nDays: ${lr.number_of_days ?? '—'}\nReason: ${lr.reason || '—'}`
    } else if (requestType === 'overtime') {
      const ot = requestRec as { date?: string; hours?: number; reason?: string }
      summary = `Date: ${ot.date || '—'}\nHours: ${ot.hours ?? '—'}\nReason: ${ot.reason || '—'}`
    } else {
      const bt = requestRec as { trip_type?: string; destination?: string; purpose?: string; start_date?: string; end_date?: string }
      summary = `Trip type: ${bt.trip_type || '—'}\nDestination: ${bt.destination || '—'}\nPurpose: ${bt.purpose || '—'}\nDates: ${bt.start_date || '—'} to ${bt.end_date || '—'}`
    }

    const label = getRequestTypeLabel(requestType)

    if (event === 'submitted') {
      // Recipients: supervisors + HR (admin/super_admin) + requestor (confirmation)
      const supervisorIds = new Set<string>()

      // employee_supervisors
      const { data: esData } = await supabase
        .from('employee_supervisors')
        .select('supervisor_id')
        .eq('employee_id', employeeId)
      for (const r of esData || []) {
        supervisorIds.add((r as { supervisor_id: string }).supervisor_id)
      }

      // employees.supervisor_id
      const { data: empData } = await supabase
        .from('employees')
        .select('supervisor_id')
        .eq('id', employeeId)
        .single()
      const supId = (empData as { supervisor_id?: string } | null)?.supervisor_id
      if (supId) supervisorIds.add(supId)

      const { data: supervisorEmails } = await supabase
        .from('employees')
        .select('email')
        .in('id', Array.from(supervisorIds))
      const toSupervisors = (supervisorEmails || [])
        .map((e: { email?: string }) => e.email)
        .filter(Boolean) as string[]

      const { data: hrRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin'])
      const hrIds = (hrRows || []).map((r: { user_id: string }) => r.user_id)
      const { data: hrEmails } = await supabase
        .from('employees')
        .select('email')
        .in('id', hrIds)
      const toHr = (hrEmails || []).map((e: { email?: string }) => e.email).filter(Boolean) as string[]

      const toNotify = [...new Set([...toSupervisors, ...toHr])]
      const subjNotify = `New ${label} Request from ${reqName}`
      const htmlNotify = `
        <h2>${subjNotify}</h2>
        <p><strong>${reqName}</strong> has submitted a ${label.toLowerCase()} request.</p>
        <pre style="background:#f4f4f4;padding:12px;border-radius:6px;">${summary.replace(/\n/g, '<br>')}</pre>
        <p>Please review and approve or reject in the HRIS system.</p>
        <p>— ${companyName}</p>
      `
      if (toNotify.length > 0) {
        sendEmail(toNotify, subjNotify, htmlNotify, `${subjNotify}\n\n${summary}\n\n— ${companyName}`, companyEmail || undefined).catch((e) => console.error('Notify email failed:', e))
      }

      if (reqEmail) {
        const subjConfirm = `Your ${label} Request Has Been Submitted`
        const htmlConfirm = `
          <h2>${subjConfirm}</h2>
          <p>Hi ${reqName},</p>
          <p>You have requested a ${label.toLowerCase()}. Here is a summary:</p>
          <pre style="background:#f4f4f4;padding:12px;border-radius:6px;">${summary.replace(/\n/g, '<br>')}</pre>
          <p>Your immediate supervisors and HR have been notified. You will receive an email when your request is approved or rejected.</p>
          <p>— ${companyName}</p>
        `
        sendEmail([reqEmail], subjConfirm, htmlConfirm, `${subjConfirm}\n\n${summary}\n\n— ${companyName}`, companyEmail || undefined).catch((e) => console.error('Confirmation email failed:', e))
      }
    } else {
      // approved / rejected: notify admin + super_admin + requestor
      let approverName = 'Supervisor'
      if (approverId) {
        const { data: approver } = await supabase
          .from('employees')
          .select('first_name, last_name')
          .eq('id', approverId)
          .single()
        if (approver) {
          approverName = `${(approver as { first_name?: string }).first_name || ''} ${(approver as { last_name?: string }).last_name || ''}`.trim() || approverName
        }
      }

      const actionLabel = event === 'approved' ? 'Approved' : 'Rejected'
      const { data: adminRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin'])
      const adminIds = (adminRows || []).map((r: { user_id: string }) => r.user_id)
      const { data: adminEmails } = await supabase
        .from('employees')
        .select('email')
        .in('id', adminIds)
      const toAdmins = (adminEmails || []).map((e: { email?: string }) => e.email).filter(Boolean) as string[]
      const toRequestor = reqEmail ? [reqEmail] : []
      const toAll = [...new Set([...toAdmins, ...toRequestor])]

      const subj = `${reqName}'s ${label} Has Been ${actionLabel}`
      const html = `
        <h2>${subj}</h2>
        <p><strong>${reqName}</strong>'s ${label.toLowerCase()} request has been <strong>${actionLabel.toLowerCase()}</strong> by ${approverName}.</p>
        <pre style="background:#f4f4f4;padding:12px;border-radius:6px;">${summary.replace(/\n/g, '<br>')}</pre>
        <p>— ${companyName}</p>
      `
      if (toAll.length > 0) {
        sendEmail(toAll, subj, html, `${subj}\n\n${summary}\n\n— ${companyName}`, companyEmail || undefined).catch((e) => console.error('Approval email failed:', e))
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers, status: 200 })
  } catch (error) {
    console.error('send-request-notifications error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
