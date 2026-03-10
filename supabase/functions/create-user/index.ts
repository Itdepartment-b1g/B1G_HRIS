// Edge Function: Create User
// Deploy: supabase functions deploy create-user
// Requires secrets: GMAIL_USER, GMAIL_PASSWORD (set via: supabase secrets set GMAIL_USER=xxx GMAIL_PASSWORD=xxx)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from "npm:nodemailer@6.9.10"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const html = `
    <h2>Welcome to B1G HRIS</h2>
    <p>Hi ${firstName} ${lastName},</p>
    <p>Your account has been created. Use the credentials below to sign in:</p>
    <ul>
      <li><strong>Employee Code:</strong> ${employeeCode}</li>
      <li><strong>Password:</strong> <code>${password}</code></li>
    </ul>
    <p>Please sign in and change your password in Settings for security.</p>
    <p>— B1G HR Team</p>
  `

  await new Promise<void>((resolve, reject) => {
    transport.sendMail(
      {
        from: gmailUser,
        to: toEmail,
        subject: 'Your B1G HRIS Login Credentials',
        html,
        text: `Hi ${firstName} ${lastName},\n\nYour account has been created.\nEmployee Code: ${employeeCode}\nPassword: ${password}\n\nPlease sign in and change your password in Settings.\n— B1G HR Team`,
      },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
      hired_date
    } = await req.json()

    // Support both role (single) and roles (array); ensure at least one role
    const roleList: string[] = Array.isArray(roles) && roles.length > 0
      ? roles
      : role ? [role] : ['employee']

    // Validate required fields (password is no longer required - we generate it)
    if (!email || !employee_code || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, employee_code, first_name, last_name' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 201 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
