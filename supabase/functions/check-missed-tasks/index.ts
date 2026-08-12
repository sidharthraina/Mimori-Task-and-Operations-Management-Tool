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

  // ── Fetch tasks due today, per store (recurrence-aware via get_due_tasks) ──
  const { data: stores, error: storesErr } = await supabase.from('stores').select('id')
  if (storesErr) {
    console.error('stores fetch error', storesErr)
    return new Response(JSON.stringify({ error: storesErr.message }), { status: 500 })
  }

  interface DueTask {
    id: string; title: string; category: string; scheduled_time: string; store_id: string
    assigned_user_id: string | null; require_photo: boolean; require_notes: boolean
    escalation_rule_id: string | null
  }
  let tasks: DueTask[] = []
  for (const store of stores ?? []) {
    const { data: storeTasks, error: dueErr } = await supabase.rpc('get_due_tasks', {
      p_store_id: store.id,
      p_date: todayISO,
    })
    if (dueErr) {
      console.error('get_due_tasks error', dueErr)
      continue
    }
    tasks = tasks.concat((storeTasks ?? []) as DueTask[])
  }

  // ── Fetch today's logs ────────────────────────────────────────────────────
  const { data: logs, error: logErr } = await supabase
    .from('task_logs')
    .select('id, task_id, status, completed_by, completed_at, photo_url, notes')
    .eq('log_date', todayISO)

  if (logErr) {
    console.error('logs fetch error', logErr)
    return new Response(JSON.stringify({ error: logErr.message }), { status: 500 })
  }

  interface LogRow { id: string; task_id: string; status: string; completed_by: string | null; completed_at: string | null; photo_url: string | null; notes: string | null }
  const logByTask = new Map<string, LogRow>((logs ?? []).map((l: LogRow) => [l.task_id, l]))

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
      existingLog.status = 'missed'
    } else {
      const { data: inserted } = await supabase
        .from('task_logs')
        .insert({ task_id: task.id, log_date: todayISO, status: 'missed' })
        .select()
        .single()
      if (inserted) logByTask.set(task.id, inserted as LogRow)
    }

    newlyMissed.push(task as MissedTask)
  }

  // ── Escalation matrix ────────────────────────────────────────────────────
  // Walks each due task's escalation chain (task override, else the task's
  // store default rule) and notifies any tier whose delay has elapsed.
  // De-duplication relies on escalation_notifications' UNIQUE(task_id, log_date,
  // tier_id, recipient_id) — the upsert below with ignoreDuplicates only
  // returns rows that were newly inserted, which is exactly what gets emailed.
  {
    const [{ data: rules }, { data: activeUsers }, { data: assignments }] = await Promise.all([
      supabase.from('escalation_rules').select('*, escalation_tiers(*)').eq('active', true),
      supabase.from('users').select('id, name, email, role').eq('active', true),
      supabase.from('user_store_assignments').select('user_id, store_id'),
    ])

    interface Tier { id: string; tier_order: number; delay_minutes: number; recipient_type: string; recipient_role: string | null; recipient_user_id: string | null }
    interface Rule { id: string; store_id: string; is_default: boolean; trigger_missed: boolean; trigger_missing_proof: boolean; escalation_tiers: Tier[] }
    interface UserRow { id: string; name: string; email: string; role: string }

    const rulesByStoreDefault = new Map<string, Rule>()
    const rulesById = new Map<string, Rule>()
    for (const r of (rules ?? []) as Rule[]) {
      rulesById.set(r.id, r)
      if (r.is_default) rulesByStoreDefault.set(r.store_id, r)
    }

    const usersById = new Map<string, UserRow>(((activeUsers ?? []) as UserRow[]).map(u => [u.id, u]))
    const storeUserIds = new Map<string, Set<string>>()
    for (const a of (assignments ?? []) as { user_id: string; store_id: string }[]) {
      if (!storeUserIds.has(a.store_id)) storeUserIds.set(a.store_id, new Set())
      storeUserIds.get(a.store_id)!.add(a.user_id)
    }

    function resolveRecipients(task: DueTask, tier: Tier): UserRow[] {
      if (tier.recipient_type === 'assignee') {
        if (!task.assigned_user_id) return []
        const u = usersById.get(task.assigned_user_id)
        return u ? [u] : []
      }
      if (tier.recipient_type === 'specific_user') {
        if (!tier.recipient_user_id) return []
        const u = usersById.get(tier.recipient_user_id)
        return u ? [u] : []
      }
      // role
      if (!tier.recipient_role) return []
      if (tier.recipient_role === 'admin') {
        return [...usersById.values()].filter(u => u.role === 'admin')
      }
      const storeIds = storeUserIds.get(task.store_id) ?? new Set()
      return [...usersById.values()].filter(u => u.role === tier.recipient_role && storeIds.has(u.id))
    }

    for (const task of tasks) {
      const rule = task.escalation_rule_id
        ? rulesById.get(task.escalation_rule_id)
        : rulesByStoreDefault.get(task.store_id)
      if (!rule) continue

      const log = logByTask.get(task.id)
      const tiers = [...rule.escalation_tiers].sort((a, b) => a.tier_order - b.tier_order)

      let triggerType: 'missed' | 'missing_proof' | null = null
      let elapsedMinutes = 0
      let triggerLogDate = todayISO

      if (rule.trigger_missed && log?.status === 'missed') {
        triggerType = 'missed'
        const [h, m] = (task.scheduled_time as string).split(':').map(Number)
        const deadline = new Date(now)
        deadline.setHours(h, (m ?? 0) + GRACE_MINUTES, 0, 0)
        elapsedMinutes = (now.getTime() - deadline.getTime()) / 60000
      } else if (
        rule.trigger_missing_proof && log?.status === 'done' && log.completed_at &&
        ((task.require_photo && !log.photo_url) || (task.require_notes && !log.notes))
      ) {
        triggerType = 'missing_proof'
        elapsedMinutes = (now.getTime() - new Date(log.completed_at).getTime()) / 60000
      }

      if (!triggerType || elapsedMinutes < 0) continue

      for (const tier of tiers) {
        if (elapsedMinutes < tier.delay_minutes) continue
        const recipients = resolveRecipients(task, tier)
        if (recipients.length === 0) continue

        const message = triggerType === 'missed'
          ? `"${task.title}" (${task.category}) was due at ${task.scheduled_time} and is still not completed.`
          : `"${task.title}" (${task.category}) was completed without ${task.require_photo && !log?.photo_url ? 'a required photo' : 'required notes'}.`

        const { data: insertedRows } = await supabase
          .from('escalation_notifications')
          .upsert(
            recipients.map(r => ({
              task_id: task.id,
              log_date: triggerLogDate,
              tier_id: tier.id,
              recipient_id: r.id,
              trigger_type: triggerType,
              message,
            })),
            { onConflict: 'task_id,log_date,tier_id,recipient_id', ignoreDuplicates: true }
          )
          .select()

        if (resendKey && insertedRows && insertedRows.length > 0) {
          for (const row of insertedRows as { recipient_id: string }[]) {
            const recipient = usersById.get(row.recipient_id)
            if (!recipient?.email) continue
            await sendEmail(
              resendKey, recipient.email,
              `⚠️ Escalation: ${escapeHtml(task.title)}`,
              `<h2 style="color:#d6721e">Escalation</h2>
               <p>${escapeHtml(message)}</p>
               <p style="color:#888;font-size:12px">Mimori</p>`
            )
          }
        }
      }
    }
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
             <p style="color:#888;font-size:12px">Mimori</p>`
          )
        }
      } else if (admin.notif_batched_missed) {
        await sendEmail(
          resendKey, to,
          `⚠️ ${newlyMissed.length} missed task(s) detected`,
          `<h2 style="color:#d6721e">Missed Tasks — ${todayISO}</h2>
           <p>The following tasks were not completed within the grace period:</p>
           <ul>${newlyMissed.map(t => `<li>${escapeHtml(t.category)}: ${escapeHtml(t.title)} (due ${escapeHtml(t.scheduled_time)})</li>`).join('')}</ul>
           <p style="color:#888;font-size:12px">Mimori</p>`
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
            Mimori
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
