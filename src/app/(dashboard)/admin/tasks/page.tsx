import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AdminTasksClient from '@/components/admin/AdminTasksClient'

export const dynamic = 'force-dynamic'

export default async function AdminTasksPage() {
  const supabase = createClient()
  const cookieStore = cookies()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  // Resolve active store
  const cookieStoreId = cookieStore.get('active-store-id')?.value
  let activeStoreId: string = cookieStoreId ?? ''
  if (!activeStoreId) {
    const { data: def } = await supabase.from('stores').select('id').eq('is_default', true).single()
    activeStoreId = def?.id ?? ''
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('store_id', activeStoreId)
    .order('category')
    .order('scheduled_time')

  return (
    <AdminTasksClient
      initialTasks={tasks ?? []}
      isReadOnly={profile?.role === 'manager'}
      storeId={activeStoreId}
    />
  )
}
