import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import WeeklyGrid from '@/components/WeeklyGrid'

export const dynamic = 'force-dynamic'

function getWeekDates(offsetWeeks: number): string[] {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + offsetWeeks * 7)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { week?: string }
}) {
  const supabase = createClient()
  const cookieStore = cookies()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) redirect('/login')

  // Resolve active store
  const cookieStoreId = cookieStore.get('active-store-id')?.value
  let activeStoreId: string = cookieStoreId ?? ''
  if (!activeStoreId) {
    const { data: def } = await supabase.from('stores').select('id').eq('is_default', true).single()
    activeStoreId = def?.id ?? ''
  }

  const { data: activeStore } = await supabase
    .from('stores')
    .select('latitude, longitude, geofence_radius_meters')
    .eq('id', activeStoreId)
    .single()

  const weekOffset = Math.min(0, parseInt(searchParams.week ?? '0', 10) || 0)
  const weekDates = getWeekDates(weekOffset)
  const [weekStart, weekEnd] = [weekDates[0], weekDates[6]]

  const [{ data: tasks }, { data: logs }, { data: rosterRows }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('store_id', activeStoreId)
      .eq('active', true)
      .order('scheduled_time', { ascending: true }),
    supabase
      .from('task_logs')
      .select('*')
      .gte('log_date', weekStart)
      .lte('log_date', weekEnd),
    supabase
      .from('user_store_assignments')
      .select('users(id, name, active)')
      .eq('store_id', activeStoreId),
  ])

  const roster = (rosterRows ?? [])
    .map((r: any) => r.users)
    .filter((u: any) => u && u.active)
    .map((u: any) => ({ id: u.id as string, name: u.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <WeeklyGrid
      tasks={tasks ?? []}
      logs={logs ?? []}
      profile={profile}
      weekDates={weekDates}
      weekOffset={weekOffset}
      roster={roster}
      store={activeStore ?? null}
      storeId={activeStoreId}
    />
  )
}
