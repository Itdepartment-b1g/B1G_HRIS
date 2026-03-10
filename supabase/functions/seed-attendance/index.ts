// Edge Function: Seed Attendance Records
// Deploy: supabase functions deploy seed-attendance
// Generates 1 month of attendance data for all employees in the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MANILA_LAT = 14.5995
const MANILA_LNG = 120.9842
const ADDRESS = '123 Business Street, Manila'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isWeekday(d: Date): boolean {
  const day = d.getDay() // 0 = Sun, 6 = Sat
  return day >= 1 && day <= 5
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: employees, error: empError } = await supabaseClient
      .from('employees')
      .select('id')
      .not('id', 'is', null)

    if (empError || !employees?.length) {
      return new Response(
        JSON.stringify({ error: 'No employees found', records_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const employeeIds = employees.map((e) => e.id)
    let inserted = 0
    const errors: string[] = []

    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const d = new Date(today)
      d.setDate(d.getDate() - dayOffset)
      if (!isWeekday(d)) continue

      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

      for (const employeeId of employeeIds) {
        const checkInHour = 8 + Math.floor(Math.random() * 2) // 8–9
        const checkInMinute = Math.floor(Math.random() * 60)
        const checkOutHour = 17 + Math.floor(Math.random() * 2) // 17–18
        const checkOutMinute = Math.floor(Math.random() * 60)

        const timeIn = `${dateStr}T${pad(checkInHour)}:${pad(checkInMinute)}:00+08:00`
        const timeOut = `${dateStr}T${pad(checkOutHour)}:${pad(checkOutMinute)}:00+08:00`

        const latIn = MANILA_LAT + (Math.random() - 0.5) * 0.01
        const lngIn = MANILA_LNG + (Math.random() - 0.5) * 0.01
        const latOut = MANILA_LAT + (Math.random() - 0.5) * 0.01
        const lngOut = MANILA_LNG + (Math.random() - 0.5) * 0.01

        const status = checkInMinute > 15 ? 'late' : 'present'
        const minutesLate = checkInMinute > 15 ? (checkInMinute - 15) + (checkInHour - 8) * 60 : 0

        const { error } = await supabaseClient
          .from('attendance_records')
          .upsert(
            {
              employee_id: employeeId,
              date: dateStr,
              time_in: timeIn,
              time_out: timeOut,
              lat_in: latIn,
              lng_in: lngIn,
              lat_out: latOut,
              lng_out: lngOut,
              address_in: ADDRESS,
              address_out: ADDRESS,
              status,
              minutes_late: status === 'late' ? minutesLate : null,
            },
            { onConflict: 'employee_id,date', ignoreDuplicates: true }
          )

        if (error) {
          errors.push(`${employeeId} ${dateStr}: ${error.message}`)
        } else {
          inserted++
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        records_created: inserted,
        employees_count: employeeIds.length,
        days_covered: 30,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Seed attendance error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
