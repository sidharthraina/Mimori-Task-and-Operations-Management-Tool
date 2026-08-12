import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import LandingPage from '@/components/marketing/LandingPage'

export const dynamic = 'force-dynamic'

// Overrides the root layout's blanket noindex — this route is the one
// public, marketing-facing page and should be discoverable.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = createClient()
  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name')
    .eq('id', 1)
    .single()

  const businessName = settings?.business_name ?? 'Mimori'
  return {
    title: `${businessName} — Recurring Task & Operations Management`,
    description: 'Turn opening routines, cleaning checklists, and daily checks into a real-time system — with photo proof, automatic escalation, and a live view across every location.',
    robots: { index: true, follow: true },
  }
}

export default async function Home() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const { data: settings } = await supabase
      .from('business_settings')
      .select('business_name, logo_url')
      .eq('id', 1)
      .single()

    return (
      <LandingPage
        businessName={settings?.business_name ?? 'Mimori'}
        logoUrl={settings?.logo_url ?? null}
      />
    )
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin' || profile?.role === 'manager') redirect('/admin')
  redirect('/tasks')
}
