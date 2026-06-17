/**
 * check-missed-tasks — Supabase Edge Function
 *
 * 1. Scans today's tasks for overdue items, marks them missed.
 * 2. Sends missed-task emails (individual or batched) per admin preferences.
 * 3. Sends end-of-day report if the configured send time has been reached today.
 *
 * Invoked by GitHub Actions every 15 min during business hours.
 * Protected by FUNCTION_SECRET header.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRACE_MINUTES = 30
const EOD_WINDOW_MINUTES = 14  // fire EOD report if within 14 min of configured time

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const fromAddr = Deno.env.get('EMAIL_FROM') ?? 'tasks@example.com'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromAddr, to: [to], subject, html }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

serve(async (req: Request) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get('x-function-secret')
  if (secret !== Deno.env.get('FUNCTION_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fallbackAdminEmail = Deno.env.get('ADMIN_EMAIL') ?? ''

  // ── Fetch admin notification settings ────────────────────────────────────
  const { data: admins } = await supabase
    .from('users')
    .select('id, email, notif_individual_missed, notif_batched_missed, eod_report_time, eod_report_email, last_eod_report_date')
    .eq('role', 'admin')
    .eq('active', true)

  // ── Fetch all active tasks ────────────────────────────────────────────────
  const { data: tasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, title, category, scheduled_time')
    .eq('active', true)
    .eq('frequency', 'daily')

  if (taskErr) {
    console.error('tasks fetch error', taskErr)
    return new Response(JSON.stringify({ error: taskErr.message }), { status: 500 })
  }

  // ── Fetch today's logs ────────────────────────────────────────────────────
  const { data: logs, error: logErr } = await supabase
    .from('task_logs')
    .select('id, task_id, status, completed_by, completed_at')
    .eq('log_date', todayISO)

  if (logErr) {
    console.error('logs fetch error', logErr)
    return new Response(JSON.stringify({ error: logErr.message }), { status: 500 })
  }

  const logByTask = new Map((logs ?? []).map((l: Record<string, string>) => [l.task_id, l]))

  // ── Detect newly missed tasks ─────────────────────────────────────────────
  interface MissedTask { id: string; title: string; category: string; scheduled_time: string }
  const newlyMissed: MissedTask[] = []

  for (const task of tasks ?? []) {
    const existingLog = logByTask.get(task.id)
    if (existingLog?.status === 'done' || existingLog?.status === 'missed') continue

    const [h, m] = (task.scheduled_time as string).split(':').map(Number)
    const deadline = new Date(now)
    deadline.setHours(h, (m ?? 0) + GRACE_MINUTES, 0, 0)
    if (now < deadline) continue

    if (existingLog) {
      await supabase.from('task_logs').update({ status: 'missed' }).eq('id', existingLog.id)
    } else {
      await supabase.from('task_logs').insert({ task_id: task.id, log_date: todayISO, status: 'missed' })
    }

    newlyMissed.push(task as MissedTask)
  }

  // ── Send missed-task emails per admin preferences ─────────────────────────
  if (resendKey && newlyMissed.length > 0) {
    for (const admin of admins ?? []) {
      const to = admin.eod_report_email || fallbackAdminEmail
      if (!to) continue

      if (admin.notif_individual_missed) {
        for (const task of newlyMissed) {
          await sendEmail(
            resendKey, to,
            `⚠️ Missed task: ${escapeHtml(task.title)}`,
            `<h2 style="color:#d6721e">Missed Task</h2>
             <p><strong>${escapeHtml(task.category)}: ${escapeHtml(task.title)}</strong> was due at ${escapeHtml(task.scheduled_time)} and has not been completed.</p>
             <p style="color:#888;font-size:12px">Café Task Management</p>`
          )
        }
      } else if (admin.notif_batched_missed) {
        await sendEmail(
          resendKey, to,
          `⚠️ ${newlyMissed.length} missed task(s) detected`,
          `<h2 style="color:#d6721e">Missed Tasks — ${todayISO}</h2>
           <p>The following tasks were not completed within the grace period:</p>
           <ul>${newlyMissed.map(t => `<li>${escapeHtml(t.category)}: ${escapeHtml(t.title)} (due ${escapeHtml(t.scheduled_time)})</li>`).join('')}</ul>
           <p style="color:#888;font-size:12px">Café Task Management</p>`
        )
      }
    }
  }

  // ── End-of-day report ─────────────────────────────────────────────────────
  if (resendKey) {
    for (const admin of admins ?? []) {
      if (!admin.eod_report_time) continue
      if (admin.last_eod_report_date === todayISO) continue // already sent today

      // Check if current time is within EOD_WINDOW_MINUTES of the configured time
      const [eodH, eodM] = (admin.eod_report_time as string).split(':').map(Number)
      const eodTarget = new Date(now)
      eodTarget.setHours(eodH ?? 22, eodM ?? 0, 0, 0)
      const diffMin = (now.getTime() - eodTarget.getTime()) / 60000
      if (diffMin < 0 || diffMin > EOD_WINDOW_MINUTES) continue

      // Fetch full day logs with user info for EOD report
      const { data: dayLogs } = await supabase
        .from('task_logs')
        .select('task_id, status, completed_by, completed_at, tasks(title, category), users:completed_by(name)')
        .eq('log_date', todayISO)

      const allTasks = tasks ?? []
      const totalCount = allTasks.length
      const doneCount = (dayLogs ?? []).filter((l: Record<string, string>) => l.status === 'done').length
      const missedCount = (dayLogs ?? []).filter((l: Record<string, string>) => l.status === 'missed').length
      const pendingCount = totalCount - doneCount - missedCount

      // Group by category
      const byCategory = new Map<string, { done: number; missed: number; pending: number }>()
      for (const task of allTasks) {
        if (!byCategory.has(task.category)) byCategory.set(task.category, { done: 0, missed: 0, pending: 0 })
      }
      for (const log of dayLogs ?? []) {
        const task = (log as Record<string, Record<string, string>>).tasks
        if (!task) continue
        const cat = byCategory.get(task.category) ?? { done: 0, missed: 0, pending: 0 }
        if ((log as Record<string, string>).status === 'done') cat.done++
        else if ((log as Record<string, string>).status === 'missed') cat.missed++
        else cat.pending++
        byCategory.set(task.category, cat)
      }

      const categoryRows = [...byCategory.entries()]
        .map(([cat, counts]) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(cat)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#16a34a;text-align:center">${counts.done}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626;text-align:center">${counts.missed}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#ca8a04;text-align:center">${counts.pending}</td>
          </tr>`
        ).join('')

      const completedRows = (dayLogs ?? [])
        .filter((l: Record<string, string>) => l.status === 'done')
        .map((l: Record<string, Record<string, string>>) => {
          const task = l.tasks ?? {}
          const user = l.users ?? {}
          const time = l.completed_at ? new Date(l.completed_at as unknown as string).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'
          return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(task.title ?? '')}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(user.name ?? '—')}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${time}</td>
          </tr>`
        }).join('')

      const missedRows = (dayLogs ?? [])
        .filter((l: Record<string, string>) => l.status === 'missed')
        .map((l: Record<string, Record<string, string>>) => {
          const task = l.tasks ?? {}
          return `<li style="color:#dc2626">${escapeHtml(task.title ?? '')} <span style="color:#888">(${escapeHtml(task.category ?? '')})</span></li>`
        }).join('')

      const to = admin.eod_report_email || fallbackAdminEmail
      if (!to) continue

      await sendEmail(
        resendKey, to,
        `📋 End of Day Report — ${todayISO}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#d6721e">End of Day Report — ${escapeHtml(todayISO)}</h2>

          <h3 style="margin-bottom:8px">Summary</h3>
          <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
            <tr style="background:#f9fafb">
              <td style="padding:8px 12px;font-weight:600">Total Tasks</td>
              <td style="padding:8px 12px;text-align:center">${totalCount}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#16a34a;font-weight:600">Completed</td>
              <td style="padding:8px 12px;text-align:center;color:#16a34a">${doneCount}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:8px 12px;color:#dc2626;font-weight:600">Missed</td>
              <td style="padding:8px 12px;text-align:center;color:#dc2626">${missedCount}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#ca8a04;font-weight:600">Pending</td>
              <td style="padding:8px 12px;text-align:center;color:#ca8a04">${pendingCount}</td>
            </tr>
          </table>

          <h3 style="margin-bottom:8px">By Category</h3>
          <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
            <tr style="background:#f3f4f6;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">
              <th style="padding:6px 12px;text-align:left">Category</th>
              <th style="padding:6px 12px">Done</th>
              <th style="padding:6px 12px">Missed</th>
              <th style="padding:6px 12px">Pending</th>
            </tr>
            ${categoryRows}
          </table>

          ${completedRows ? `
          <h3 style="margin-bottom:8px">Completed Tasks</h3>
          <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
            <tr style="background:#f3f4f6;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">
              <th style="padding:6px 12px;text-align:left">Task</th>
              <th style="padding:6px 12px;text-align:left">Completed by</th>
              <th style="padding:6px 12px;text-align:left">Time</th>
            </tr>
            ${completedRows}
          </table>` : ''}

          ${missedRows ? `
          <h3 style="color:#dc2626;margin-bottom:8px">Missed Tasks</h3>
          <ul style="margin:0 0 24px 0;padding-left:20px">${missedRows}</ul>` : ''}

          <p style="color:#888;font-size:12px;border-top:1px solid #f3f4f6;padding-top:12px">
            Café Task Management
          </p>
        </div>`
      )

      // Mark EOD report as sent for today
      await supabase
        .from('users')
        .update({ last_eod_report_date: todayISO })
        .eq('id', admin.id)
    }
  }

  return new Response(
    JSON.stringify({ date: todayISO, newly_missed: newlyMissed.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
