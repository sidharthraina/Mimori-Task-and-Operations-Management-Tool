import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/ui/DashboardNav'
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
    notificationCount += count ?? 0
  }
  if (profile.role === 'admin' || profile.role === 'manager') {
    const { count } = await supabase
      .from('escalation_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false)
    notificationCount += count ?? 0
  }

  const { data: businessSettings } = await supabase
    .from('business_settings')
    .select('business_name, logo_url')
    .eq('id', 1)
    .single()

  // Whole-page store-color wash — subtle (8%), theme-aware via color-mix()
  // against the live --background token (so it never breaks dark mode the
  // way the old white-only tint did), and transitions slowly on store
  // switch so the admin visibly notices they've changed stores.
  const storeAccent = activeStore?.color ?? '#d6721e'

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-500 bg-[color-mix(in_srgb,var(--store-accent)_8%,rgb(var(--background)))]"
      style={{ '--store-accent': storeAccent } as React.CSSProperties}
    >
      <DashboardNav
        user={profile}
        notificationCount={notificationCount}
        stores={stores}
        activeStore={activeStore}
        businessName={businessSettings?.business_name ?? 'Mimori'}
        logoUrl={businessSettings?.logo_url ?? null}
      />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="w-full max-w-6xl mx-auto px-4 py-4">
        <a
          href="https://github.com/sidharthraina/Mimori-Task-and-Operations-Management-Tool"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-right text-onSurfaceVariant hover:underline"
          style={{ fontFamily: 'var(--font-roboto)', fontSize: 12, fontWeight: 400 }}
        >
          Powered by Mimori
        </a>
      </footer>
    </div>
  )
}
