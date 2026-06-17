import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/utils'
import AdminDashboard from '@/components/admin/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = createClient()
  const today = todayISO()

  const since = new Date()
  since.setDate(since.getDate() - 6)
  const sinceISO = since.toISOString().slice(0, 10)

  const [{ data: tasks }, { data: logs }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('active', true)
      .order('scheduled_time'),
    supabase
      .from('task_logs')
      .select('*, tasks(*), users:completed_by(id, name, email)')
      .gte('log_date', sinceISO)
      .order('log_date', { ascending: false }),
  ])

  return (
    <AdminDashboard
      tasks={tasks ?? []}
      logs={logs ?? []}
      today={today}
    />
  )
}
