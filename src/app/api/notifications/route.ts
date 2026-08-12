import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// GET — unread count + list (admin only)
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin' || !profile.active) {
    return NextResponse.json({ count: 0, notifications: [] })
  }

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    count: notifications?.length ?? 0,
    notifications: notifications ?? [],
  })
}

// POST — create a notification for an overdue task (any active user)
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('active')
    .eq('id', user.id)
    .single()

  if (!profile?.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { task_id, log_date, message } = body

  if (!task_id || !log_date || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (typeof message !== 'string' || message.length > 500) {
    return NextResponse.json({ error: 'message must be 500 characters or fewer' }, { status: 400 })
  }

  // Use service role so any user can create a notification (RLS restricts to admin only)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('notifications')
    .upsert(
      { task_id, log_date, message },
      { onConflict: 'task_id,log_date', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH — mark one notification (body: { id }) or all unread notifications as read (admin only)
export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin' || !profile.active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : null

  const query = supabase.from('notifications').update({ is_read: true })
  const { error } = id ? await query.eq('id', id) : await query.eq('is_read', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
