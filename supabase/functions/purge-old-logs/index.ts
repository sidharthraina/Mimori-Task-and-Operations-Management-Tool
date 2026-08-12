/**
 * purge-old-logs — Supabase Edge Function
 *
 * Deletes task_logs rows (and their Storage photos) older than 90 days.
 *
 * Invoked externally (GitHub Actions daily at 3 AM).
 * Protected by FUNCTION_SECRET header.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RETENTION_DAYS = 90

serve(async (req: Request) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get('x-function-secret')
  if (secret !== Deno.env.get('FUNCTION_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)
  const cutoffISO = cutoffDate.toISOString().slice(0, 10)

  // Fetch logs to be deleted (need photo_urls to clean Storage)
  const { data: oldLogs, error: fetchErr } = await supabase
    .from('task_logs')
    .select('id, photo_url')
    .lt('log_date', cutoffISO)

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!oldLogs || oldLogs.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No logs to purge', cutoff: cutoffISO, deleted: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Delete Storage photos ─────────────────────────────────────────────────
  const photoPaths: string[] = oldLogs
    .filter((l: { photo_url: string | null }) => l.photo_url)
    .map((l: { photo_url: string }) => {
      // Extract the storage path from the signed URL or raw path
      try {
        const url = new URL(l.photo_url)
        // Signed URL format: /storage/v1/object/sign/task-photos/<path>
        const match = url.pathname.match(/\/task-photos\/(.+)$/)
        return match ? match[1] : null
      } catch {
        // Already a raw path
        return l.photo_url
      }
    })
    .filter(Boolean) as string[]

  if (photoPaths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from('task-photos')
      .remove(photoPaths)

    if (storageErr) {
      console.error('Storage delete error (continuing):', storageErr.message)
    }
  }

  // ── Delete task_log rows ──────────────────────────────────────────────────
  const ids = oldLogs.map((l: { id: string }) => l.id)

  // Delete in batches of 500 to stay under payload limits
  let totalDeleted = 0
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500)
    const { error: delErr, count } = await supabase
      .from('task_logs')
      .delete({ count: 'exact' })
      .in('id', batch)

    if (delErr) {
      console.error('Delete error on batch', i, delErr.message)
    } else {
      totalDeleted += count ?? 0
    }
  }

  // ── Delete old escalation notifications (no other retention exists for these) ──
  const { count: escalationDeleted, error: escalationErr } = await supabase
    .from('escalation_notifications')
    .delete({ count: 'exact' })
    .lt('log_date', cutoffISO)

  if (escalationErr) {
    console.error('escalation_notifications purge error (continuing):', escalationErr.message)
  }

  console.log(`Purge complete: deleted ${totalDeleted} logs, ${photoPaths.length} photos, ${escalationDeleted ?? 0} escalation notifications. Cutoff: ${cutoffISO}`)

  return new Response(
    JSON.stringify({
      cutoff: cutoffISO,
      deleted: totalDeleted,
      photos_removed: photoPaths.length,
      escalation_notifications_deleted: escalationDeleted ?? 0,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
