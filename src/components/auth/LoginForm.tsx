'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const OAUTH_ERRORS: Record<string, string> = {
  not_registered:  'This Google account is not registered. Contact your admin.',
  account_inactive: 'Your account is inactive. Contact your admin.',
  oauth_failed:    'Google sign-in failed. Please try again.',
}

interface Props {
  businessName: string
  logoUrl: string | null
}

export default function LoginForm({ businessName, logoUrl }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const oauthError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERRORS[oauthError] ?? 'Sign-in failed. Please try again.') : null
  )
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (authError) {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surfaceContainerLow">
      {/* Logo — unconstrained so it centres on the full page */}
      <div className="text-center mb-8">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={businessName} className="mx-auto max-h-24 w-auto object-contain" />
        ) : (
          <p
            className="uppercase text-primary leading-none font-display"
            style={{ fontSize: 'clamp(52px, 14vw, 111px)' }}
          >
            {businessName}
          </p>
        )}
        <p className="mt-3 font-light text-base text-onSurfaceVariant">Task &amp; Operations Management Tool</p>
      </div>

      {/* Form — constrained width, centred by parent */}
      <div className="w-full max-w-sm">
        <div className="card space-y-4 pb-6">
          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-outline bg-surface px-4 py-2.5 text-sm font-medium text-onSurface hover:bg-surfaceContainer transition-colors disabled:opacity-50"
          >
            {/* Google logo SVG */}
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outlineVariant" />
            </div>
            <div className="relative flex justify-center text-xs text-onSurfaceVariant/70 bg-surfaceContainerLow px-2 mx-auto w-fit">
              or sign in with email
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-14"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-onSurfaceVariant/70 hover:text-onSurfaceVariant transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || googleLoading} className="btn-primary w-full mt-2">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <a
          href="https://github.com/sidharthraina/Mimori-Task-and-Operations-Management-Tool"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block text-center text-onSurfaceVariant hover:underline"
          style={{ fontSize: 12, fontWeight: 400 }}
        >
          Powered by Mimori
        </a>
      </div>
    </div>
  )
}
