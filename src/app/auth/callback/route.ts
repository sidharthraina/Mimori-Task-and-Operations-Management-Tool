import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  // Verify this Google account's email exists in public.users (admin must pre-register)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, active')
    .eq('email', user.email)
    .single()

  if (!profile) {
    // Email not pre-registered — sign out and reject
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_registered`)
  }

  if (!profile.active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=account_inactive`)
  }

  return NextResponse.redirect(`${origin}/`)
}
