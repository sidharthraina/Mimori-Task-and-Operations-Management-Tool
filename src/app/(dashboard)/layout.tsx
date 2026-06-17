import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/ui/DashboardNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, email, role, active, can_add_tasks, notif_individual_missed, notif_batched_missed, eod_report_time, eod_report_email')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) redirect('/login')

  let notificationCount = 0
  if (profile.role === 'admin') {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
    notificationCount = count ?? 0
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf6ee]">
      <DashboardNav user={profile} notificationCount={notificationCount} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
