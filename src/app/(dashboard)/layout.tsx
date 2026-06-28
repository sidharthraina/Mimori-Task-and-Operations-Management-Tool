import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/ui/DashboardNav'
import { hexToTint } from '@/lib/utils'
import type { Store } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const cookieStore = cookies()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, email, role, active, can_add_tasks, notif_individual_missed, notif_batched_missed, eod_report_time, eod_report_email')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) redirect('/login')

  // Fetch stores: admins see all, staff see only their assigned stores
  let stores: Store[] = []
  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .order('created_at')
    stores = (data ?? []) as Store[]
  } else {
    const { data } = await supabase
      .from('user_store_assignments')
      .select('stores(*)')
      .eq('user_id', user.id)
    stores = ((data ?? []).map((d: any) => d.stores).filter(Boolean)) as Store[]
  }

  // Resolve active store: cookie → default → first
  const cookieStoreId = cookieStore.get('active-store-id')?.value
  const activeStore: Store | null =
    stores.find(s => s.id === cookieStoreId) ??
    stores.find(s => s.is_default) ??
    stores[0] ??
    null

  let notificationCount = 0
  if (profile.role === 'admin' && activeStore) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('store_id', activeStore.id)
    notificationCount = count ?? 0
  }

  const bgTint = hexToTint(activeStore?.color ?? '#d6721e')

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-500" style={{ backgroundColor: bgTint }}>
      <DashboardNav
        user={profile}
        notificationCount={notificationCount}
        stores={stores}
        activeStore={activeStore}
      />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="w-full max-w-6xl mx-auto px-4 py-4">
        <p className="text-right text-black" style={{ fontFamily: 'var(--font-roboto)', fontSize: 12, fontWeight: 400 }}>
          Powered by Mimori
        </p>
      </footer>
    </div>
  )
}
