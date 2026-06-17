import { redirect } from 'next/navigation'
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) redirect('/login')

  // weekOffset: 0 = current week, -1 = last week, -2 = two weeks ago, etc.
  const weekOffset = Math.min(0, parseInt(searchParams.week ?? '0', 10) || 0)

  const weekDates = getWeekDates(weekOffset)
  const [weekStart, weekEnd] = [weekDates[0], weekDates[6]]

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('active', true)
    .order('scheduled_time', { ascending: true })

  const { data: logs } = await supabase
    .from('task_logs')
    .select('*')
    .gte('log_date', weekStart)
    .lte('log_date', weekEnd)

  return (
    <WeeklyGrid
      tasks={tasks ?? []}
      logs={logs ?? []}
      profile={profile}
      weekDates={weekDates}
      weekOffset={weekOffset}
    />
  )
}
