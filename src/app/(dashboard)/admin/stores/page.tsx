import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminStoresClient from '@/components/admin/AdminStoresClient'

export const dynamic = 'force-dynamic'

export default async function AdminStoresPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/admin')

  const { data: stores } = await supabase
    .from('stores')
    .select('*')
    .order('created_at')

  return <AdminStoresClient initialStores={stores ?? []} />
}
