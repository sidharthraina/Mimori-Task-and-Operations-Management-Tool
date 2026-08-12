import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — unread escalation notifications addressed to the current user
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: notifications } = await supabase
    .from('escalation_notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    count: notifications?.length ?? 0,
    notifications: notifications ?? [],
  })
}

// PATCH — mark one notification (body: { id }) or all of the current user's
// unread escalation notifications as read
export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : null

  const query = supabase.from('escalation_notifications').update({ is_read: true }).eq('recipient_id', user.id)
  const { error } = id ? await query.eq('id', id) : await query.eq('is_read', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
