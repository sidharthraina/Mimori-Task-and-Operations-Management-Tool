import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import LoginForm from '@/components/auth/LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const supabase = createClient()
  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, logo_url')
    .eq('id', 1)
    .single()

  return (
    <Suspense>
      <LoginForm
        businessName={settings?.business_name ?? 'Mimori'}
        logoUrl={settings?.logo_url ?? null}
      />
    </Suspense>
  )
}
