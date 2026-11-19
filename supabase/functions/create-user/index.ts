  // Edge Function: Create User
  // Deploy: supabase functions deploy create-user
  // Requires secrets: GMAIL_USER, GMAIL_PASSWORD (set via: supabase secrets set GMAIL_USER=xxx GMAIL_PASSWORD=xxx)

  import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
  import nodemailer from "npm:nodemailer@6.9.10"
  import { corsHeaders, verifyUserJwt, requireAdmin } from './auth.ts'
  import { createUserSchema, validateOr400, ValidationError } from './validation.ts'
  // Yellow confidentiality footnote appended to every outbound email.
  const CONFIDENTIALITY_PARAGRAPHS = [
    'The information contained in this email and any attachments is confidential and intended solely for the use of the individual or entity to whom it is addressed and other authorized recipients. It may contain confidential employee or company information and should not be disclosed, copied, distributed, or used by any unauthorized person.',
    'If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments from your system. If you have received this email in error, please do not disclose, copy, or use any information contained herein.',
    'B1G Corporation does not guarantee the proper or complete transmission of this communication or the timely receipt of the information contained herein. B1G Corporation shall not be held liable for any damage arising from the transmission of this email or its attachments, including damage caused by viruses, unauthorized access, interception, or other security-related incidents.',
  ]

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

  /** Generate a random password: 12 chars, letters + numbers */
  function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let pwd = ''
    const arr = new Uint8Array(12)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 12; i++) pwd += chars[arr[i]! % chars.length]
    return pwd
  }

  /** Send password to user's company email via Gmail SMTP */
  async function sendPasswordEmail(toEmail: string, password: string, employeeCode: string, firstName: string, lastName: string): Promise<void> {
    const gmailUser = Deno.env.get('GMAIL_USER')
    const gmailPass = Deno.env.get('GMAIL_PASSWORD')

    if (!gmailUser || !gmailPass) {
      console.warn('GMAIL_USER or GMAIL_PASSWORD not set - skipping email. Set secrets: supabase secrets set GMAIL_USER=xxx GMAIL_PASSWORD=xxx')
      return
    }

    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailPass },
    })

    const appUrl = 'https://b1ghris.vercel.app/'

    const html = `
      <h2>Welcome to B1G HRIS</h2>
      <p>Hi ${firstName} ${lastName},</p>
      <p>Your account has been created. Use the credentials below to sign in:</p>
      <ul>
        <li><strong>Employee Code:</strong> ${employeeCode}</li>
        <li><strong>Password:</strong> <code>${password}</code></li>
      </ul>
      <p>Access the app: <a href="${appUrl}" target="_blank" rel="noopener noreferrer">${appUrl}</a></p>
      <p>Please sign in and change your password in Settings for security.</p>
      <p>— B1G HR Team</p>
    `

    await new Promise<void>((resolve, reject) => {
      transport.sendMail(
        {
          from: gmailUser,
          to: toEmail,
          subject: 'Your B1G HRIS Login Credentials',
          html: appendConfidentialityHtml(html),
          text: appendConfidentialityText(`Hi ${firstName} ${lastName},\n\nYour account has been created.\nEmployee Code: ${employeeCode}\nPassword: ${password}\n\nAccess the app: ${appUrl}\n\nPlease sign in and change your password in Settings.\n— B1G HR Team`),
        },
        (err) => (err ? reject(err) : resolve())
      )
    })
  }

  serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders(req) })
    }

    try {
      const auth = await verifyUserJwt(req)
      const forbidden = requireAdmin(auth, req)
      if (forbidden) return forbidden

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )

      const body = await req.json()
      let parsed
      try {
        parsed = validateOr400(createUserSchema, body)
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof ValidationError ? e.message : 'Invalid request body' }),
          { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const {
        email,
        password: providedPassword,
        employee_code,
        first_name,
        last_name,
        phone,
        department,
        position,
        role,
        roles,
        hired_date,
      } = parsed

      const roleList: string[] = Array.isArray(roles) && roles.length > 0
        ? roles
        : role ? [role] : ['employee']

      // Generate random password if not provided
      const password = providedPassword && String(providedPassword).trim()
        ? String(providedPassword)
        : generatePassword()

      // Create auth user
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          employee_code,
          first_name,
          last_name,
        }
      })

      if (authError) {
        console.error('Auth error:', authError)
        return new Response(
          JSON.stringify({ error: authError.message }),
          { 
            headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
            status: 400 
          }
        )
      }

      // Update employee profile
      const { error: employeeError } = await supabaseClient
        .from('employees')
        .update({
          employee_code,
          first_name,
          last_name,
          email,
          phone: phone || null,
          department: department || null,
          position: position || null,
          hired_date: hired_date || null,
          is_active: true,
        })
        .eq('id', authUser.user.id)

      if (employeeError) {
        console.error('Employee update error:', employeeError)
      }

      // Sync roles: trigger inserts employee; replace with desired set
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .delete()
        .eq('user_id', authUser.user.id)

      if (!roleError && roleList.length > 0) {
        const { error: insertError } = await supabaseClient
          .from('user_roles')
          .insert(roleList.map((r) => ({ user_id: authUser.user.id, role: r })))

        if (insertError) {
          console.error('Role assignment error:', insertError)
        }
      }

      // Send password to user's company email (non-blocking)
      if (!providedPassword) {
        sendPasswordEmail(email, password, employee_code, first_name, last_name).catch((err) => {
          console.error('Failed to send password email:', err)
        })
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: authUser.user.id,
            email: authUser.user.email,
            employee_code,
            first_name,
            last_name,
            roles: roleList
          }
        }),
        { 
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
          status: 201 
        }
      )

    } catch (error) {
      console.error('Unexpected error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, 
          status: 500 
        }
      )
    }
  })
