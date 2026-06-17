import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminTasksClient from '@/components/admin/AdminTasksClient'

export const dynamic = 'force-dynamic'

export default async function AdminTasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('category')
    .order('scheduled_time')

  return (
    <AdminTasksClient
      initialTasks={tasks ?? []}
      isReadOnly={profile?.role === 'manager'}
    />
  )
}
