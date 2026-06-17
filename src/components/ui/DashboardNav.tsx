'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User } from '@/types/database'

interface Props {
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'can_add_tasks' |
    'notif_individual_missed' | 'notif_batched_missed' | 'eod_report_time' | 'eod_report_email'>
  notificationCount?: number
}

type ProfileTab = 'account' | 'notifications'

export default function DashboardNav({ user, notificationCount = 0 }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [count, setCount] = useState(notificationCount)
  const [showProfile, setShowProfile] = useState(false)
  const [profileTab, setProfileTab] = useState<ProfileTab>('account')

  // Account fields
  const [name, setName] = useState(user.name)
  const [newPassword, setNewPassword] = useState('')

  // Notification settings
  const [notifIndividual, setNotifIndividual] = useState(user.notif_individual_missed)
  const [notifBatched, setNotifBatched] = useState(user.notif_batched_missed)
  const [eodTime, setEodTime] = useState(user.eod_report_time ?? '22:00')
  const [eodEmail, setEodEmail] = useState(user.eod_report_email ?? '')

  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  const isAdmin   = user.role === 'admin'
  const isManager = user.role === 'manager'

  function openProfile(tab: ProfileTab = 'account') {
    setProfileTab(tab)
    setProfileError(null)
    setProfileSuccess(null)
    setShowProfile(true)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleMarkAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setCount(0)
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setProfileError(null)
    setProfileSuccess(null)

    const supabase = createClient()
    const { error: nameErr } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', user.id)

    if (nameErr) { setProfileError(nameErr.message); setSaving(false); return }

    if (newPassword) {
      if (newPassword.length < 8) {
        setProfileError('Password must be at least 8 characters.')
        setSaving(false)
        return
      }
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
      if (pwErr) { setProfileError(pwErr.message); setSaving(false); return }
    }

    setProfileSuccess('Profile updated.')
    setNewPassword('')
    setSaving(false)
    router.refresh()
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setProfileError(null)
    setProfileSuccess(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({
        notif_individual_missed: notifIndividual,
        notif_batched_missed:    notifBatched,
        eod_report_time:         eodTime,
        eod_report_email:        eodEmail.trim() || null,
      })
      .eq('id', user.id)

    if (error) { setProfileError(error.message); setSaving(false); return }
    setProfileSuccess('Notification settings saved.')
    setSaving(false)
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const navLinkClass = (href: string) => cn(
    'btn-ghost whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    isActive(href)
      ? 'bg-brand-100 text-brand-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  )

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href={isAdmin || isManager ? '/admin' : '/tasks'} className="flex items-center gap-2 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Café Logo" className="h-9 w-9 object-contain" />
            <span className="hidden sm:inline text-sm font-semibold tracking-wide text-dark-900">{process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'Café'}</span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5 text-sm overflow-x-auto">
            {(isAdmin || isManager) && (
              <Link href="/admin" className={navLinkClass('/admin')}>Dashboard</Link>
            )}
            <Link href="/tasks" className={navLinkClass('/tasks')}>Tasks</Link>
            {(isAdmin || isManager) && (
              <Link href="/admin/tasks" className={navLinkClass('/admin/tasks')}>Task List</Link>
            )}
            {isAdmin && (
              <Link href="/admin/users" className={navLinkClass('/admin/users')}>Cafe Staff</Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notification bell (admin only) */}
            {isAdmin && (
              <button
                onClick={handleMarkAllRead}
                title={count > 0 ? `${count} missed task alert${count > 1 ? 's' : ''} — click to dismiss` : 'No alerts'}
                className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className={cn('w-5 h-5', count > 0 ? 'text-red-500' : 'text-gray-400')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            )}

            {/* Profile button */}
            <button
              onClick={() => openProfile('account')}
              className="hidden sm:flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="text-sm text-gray-700 truncate max-w-[120px] leading-tight">{user.name}</div>
                <div className={cn('text-[10px] font-medium mt-0.5',
                  isAdmin ? 'text-brand-600' : isManager ? 'text-purple-600' : 'text-gray-500'
                )}>
                  {isAdmin ? 'Admin' : isManager ? 'Manager' : 'Staff'}
                </div>
              </div>
            </button>

            <button onClick={handleSignOut} className="btn-ghost text-xs text-gray-500">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="card w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-dark-900">Profile</h2>
              <button
                onClick={() => setShowProfile(false)}
                className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs — only admins see notification settings */}
            {isAdmin && (
              <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
                {(['account', 'notifications'] as ProfileTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setProfileTab(tab); setProfileError(null); setProfileSuccess(null) }}
                    className={cn(
                      'flex-1 text-xs font-medium rounded-lg py-1.5 capitalize transition-colors',
                      profileTab === tab ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {tab === 'notifications' ? 'Email Alerts' : 'Account'}
                  </button>
                ))}
              </div>
            )}

            {/* Account tab */}
            {profileTab === 'account' && (
              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div>
                  <label className="label">Display name</label>
                  <input className="input" required value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" value={user.email} disabled />
                  <p className="text-xs text-gray-400 mt-1">Email changes require admin action</p>
                </div>
                <div>
                  <label className="label">New password</label>
                  <input
                    type="password" className="input"
                    placeholder="Leave blank to keep current"
                    minLength={8} value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                {profileError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{profileError}</p>}
                {profileSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{profileSuccess}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowProfile(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </form>
            )}

            {/* Notification settings tab (admin only) */}
            {profileTab === 'notifications' && isAdmin && (
              <form onSubmit={handleSaveNotifications} className="space-y-5">

                {/* Missed task emails */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Missed Task Alerts</p>

                  <div className="space-y-3">
                    {/* Individual */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Individual emails</p>
                        <p className="text-xs text-gray-400 mt-0.5">One email per missed task as soon as it&apos;s detected</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifIndividual(v => !v)}
                        className={cn(
                          'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                          notifIndividual ? 'bg-brand-500' : 'bg-gray-200'
                        )}
                        role="switch" aria-checked={notifIndividual}
                      >
                        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                          notifIndividual ? 'translate-x-4' : 'translate-x-0'
                        )} />
                      </button>
                    </div>

                    {/* Batched */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Batched emails</p>
                        <p className="text-xs text-gray-400 mt-0.5">One email per check run, grouping all newly missed tasks</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifBatched(v => !v)}
                        className={cn(
                          'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                          notifBatched ? 'bg-brand-500' : 'bg-gray-200'
                        )}
                        role="switch" aria-checked={notifBatched}
                      >
                        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                          notifBatched ? 'translate-x-4' : 'translate-x-0'
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">End of Day Report</p>
                  <p className="text-xs text-gray-400 mb-3">Sent daily with a full breakdown — counts, categories, who completed what, and missed tasks.</p>

                  <div className="space-y-3">
                    <div>
                      <label className="label">Send time</label>
                      <input
                        type="time" className="input w-36"
                        value={eodTime}
                        onChange={e => setEodTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Report email <span className="text-gray-400 font-normal">(leave blank to use ADMIN_EMAIL)</span></label>
                      <input
                        type="email" className="input"
                        placeholder="owner@example.com"
                        value={eodEmail}
                        onChange={e => setEodEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {profileError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{profileError}</p>}
                {profileSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{profileSuccess}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowProfile(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
