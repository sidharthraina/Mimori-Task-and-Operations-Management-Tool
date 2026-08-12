import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AdminEscalationClient from '@/components/admin/AdminEscalationClient'

export const dynamic = 'force-dynamic'

export default async function AdminEscalationPage() {
  const supabase = createClient()
  const cookieStore = cookies()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/admin')

  // Resolve active store
  const cookieStoreId = cookieStore.get('active-store-id')?.value
  let activeStoreId: string = cookieStoreId ?? ''
  if (!activeStoreId) {
    const { data: def } = await supabase.from('stores').select('id').eq('is_default', true).single()
    activeStoreId = def?.id ?? ''
  }

  const [{ data: rules }, { data: rosterRows }] = await Promise.all([
    supabase
      .from('escalation_rules')
      .select('*, escalation_tiers(*)')
      .eq('store_id', activeStoreId)
      .order('is_default', { ascending: false })
      .order('name'),
    supabase
      .from('user_store_assignments')
      .select('users(id, name, role, active)')
      .eq('store_id', activeStoreId),
  ])

  const roster = (rosterRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.users)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((u: any) => u && u.active)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((u: any) => ({ id: u.id as string, name: u.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <AdminEscalationClient initialRules={(rules ?? []) as any} storeId={activeStoreId} roster={roster} />
  )
}
