'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User, Store } from '@/types/database'

interface Props {
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'can_add_tasks' |
    'notif_individual_missed' | 'notif_batched_missed' | 'eod_report_time' | 'eod_report_email'>
  notificationCount?: number
  stores: Store[]
  activeStore: Store | null
}

type ProfileTab = 'account' | 'notifications'

export default function DashboardNav({ user, notificationCount = 0, stores, activeStore }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [count, setCount] = useState(notificationCount)
  const [showProfile, setShowProfile] = useState(false)
  const [profileTab, setProfileTab] = useState<ProfileTab>('account')
  const [storeOpen, setStoreOpen] = useState(false)
  const [currentStore, setCurrentStore] = useState(activeStore)

  // Account fields
  const [name, setName] = useState(user.name)
  const [newPassword, setNewPassword] = useState('')

  // Notification settings
  const [notifIndividual, setNotifIndividual] = useState(user.notif_individual_missed)
  const [notifBatched, setNotifBatched] = useState(user.notif_batched_missed)
  const [eodTime, setEodTime] = useState(user.eod_report_time ?? '22:00')
  const [eodEmail, setEodEmail] = useState(user.eod_report_email ?? '')

  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  const isAdmin   = user.role === 'admin'
  const isManager = user.role === 'manager'
  const showStoreSwitcher = isAdmin || stores.length > 1

  function openProfile(tab: ProfileTab = 'account') {
    setProfileTab(tab)
    setProfileError(null)
    setProfileSuccess(null)
    setShowProfile(true)
  }

  function handleStoreSwitch(store: Store) {
    document.cookie = `active-store-id=${store.id}; path=/; max-age=2592000; SameSite=Lax`
    setCurrentStore(store)
    setStoreOpen(false)
    router.refresh()
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

  const accentColor = currentStore?.color ?? '#d6721e'

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur relative">
        {/* Store colour accent strip */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] transition-colors duration-300" style={{ backgroundColor: accentColor }} />

        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href={isAdmin || isManager ? '/admin' : '/tasks'} className="flex-shrink-0">
            <span
              className="text-dark-900 leading-none"
              style={{ fontFamily: 'var(--font-permanent-marker)', fontSize: 32 }}
            >
              {process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'Mimori'}
            </span>
          </Link>

          {/* Store switcher */}
          {showStoreSwitcher && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setStoreOpen(o => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
                <span className="max-w-[120px] truncate">{currentStore?.name ?? 'Select store'}</span>
                <svg className={cn('w-3 h-3 text-gray-400 transition-transform', storeOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {storeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStoreOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                    {stores.map(store => (
                      <button
                        key={store.id}
                        onClick={() => handleStoreSwitch(store)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50',
                          store.id === currentStore?.id && 'bg-gray-50'
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: store.color }} />
                        <span className="flex-1 truncate text-gray-800">{store.name}</span>
                        {store.is_default && (
                          <span className="text-[10px] text-gray-400 font-medium">Default</span>
                        )}
                        {store.id === currentStore?.id && (
                          <svg className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                    {isAdmin && (
                      <>
                        <div className="border-t border-gray-100" />
                        <Link
                          href="/admin/stores"
                          onClick={() => setStoreOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Manage stores
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Nav links — desktop only */}
          <nav className="hidden sm:flex items-center gap-0.5 text-sm overflow-x-auto">
            {(isAdmin || isManager) && (
              <Link href="/admin" className={navLinkClass('/admin')}>Dashboard</Link>
            )}
            <Link href="/tasks" className={navLinkClass('/tasks')}>Tasks</Link>
            {(isAdmin || isManager) && (
              <Link href="/admin/tasks" className={navLinkClass('/admin/tasks')}>Task List</Link>
            )}
            {isAdmin && (
              <Link href="/admin/users" className={navLinkClass('/admin/users')}>Staff</Link>
            )}
            {isAdmin && (
              <Link href="/admin/stores" className={navLinkClass('/admin/stores')}>Stores</Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notification bell (admin only) */}
            {isAdmin && (
              <button
                onClick={handleMarkAllRead}
                title={count > 0 ? `${count} missed task alert${count > 1 ? 's' : ''} — click to dismiss` : 'No alerts'}
                className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
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

            <button onClick={handleSignOut} className="hidden sm:inline-flex btn-ghost text-xs text-gray-500">
              Sign out
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setShowMobileMenu(v => !v)}
              className="sm:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            >
              {showMobileMenu ? (
                <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav menu */}
        {showMobileMenu && (
          <div className="sm:hidden border-t border-gray-100 px-4 py-3 space-y-1">
            {(isAdmin || isManager) && (
              <Link href="/admin" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/admin'), 'w-full justify-start')}>Dashboard</Link>
            )}
            <Link href="/tasks" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/tasks'), 'w-full justify-start')}>Tasks</Link>
            {(isAdmin || isManager) && (
              <Link href="/admin/tasks" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/admin/tasks'), 'w-full justify-start')}>Task List</Link>
            )}
            {isAdmin && (
              <Link href="/admin/users" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/admin/users'), 'w-full justify-start')}>Staff</Link>
            )}
            {isAdmin && (
              <Link href="/admin/stores" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/admin/stores'), 'w-full justify-start')}>Stores</Link>
            )}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => { openProfile('account'); setShowMobileMenu(false) }}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-800">{user.name}</div>
                  <div className={cn('text-xs', isAdmin ? 'text-brand-600' : isManager ? 'text-purple-600' : 'text-gray-500')}>
                    {isAdmin ? 'Admin' : isManager ? 'Manager' : 'Staff'}
                  </div>
                </div>
              </button>
              <button onClick={handleSignOut} className="btn-ghost text-xs text-gray-500">Sign out</button>
            </div>
          </div>
        )}
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.32] backdrop-blur-sm p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-dark-900">Profile</h2>
              <button
                onClick={() => setShowProfile(false)}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs — only admins see notification settings */}
            {isAdmin && (
              <div className="flex gap-1 mb-5 bg-gray-100 rounded-full p-1">
                {(['account', 'notifications'] as ProfileTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setProfileTab(tab); setProfileError(null); setProfileSuccess(null) }}
                    className={cn(
                      'flex-1 text-xs font-medium rounded-full py-1.5 capitalize transition-colors',
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
                  <button type="button" onClick={() => setShowProfile(false)} className="btn-ghost flex-1">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </form>
            )}

            {/* Notification settings tab (admin only) */}
            {profileTab === 'notifications' && isAdmin && (
              <form onSubmit={handleSaveNotifications} className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Missed Task Alerts</p>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Individual emails</p>
                        <p className="text-xs text-gray-400 mt-0.5">One email per missed task as soon as it&apos;s detected</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifIndividual(v => !v)}
                        className={cn(
                          'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200',
                          notifIndividual ? 'bg-brand-500 border-brand-500' : 'bg-gray-50 border-gray-400'
                        )}
                        role="switch"
                        aria-checked={notifIndividual}
                      >
                        <span className={cn(
                          'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                          notifIndividual ? 'left-6 w-6 h-6 bg-white' : 'left-1 w-4 h-4 bg-gray-400'
                        )} />
                      </button>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Batched emails</p>
                        <p className="text-xs text-gray-400 mt-0.5">One email per check run, grouping all newly missed tasks</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifBatched(v => !v)}
                        className={cn(
                          'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200',
                          notifBatched ? 'bg-brand-500 border-brand-500' : 'bg-gray-50 border-gray-400'
                        )}
                        role="switch"
                        aria-checked={notifBatched}
                      >
                        <span className={cn(
                          'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                          notifBatched ? 'left-6 w-6 h-6 bg-white' : 'left-1 w-4 h-4 bg-gray-400'
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
                      <input type="time" className="input w-36" value={eodTime} onChange={e => setEodTime(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Report email <span className="text-gray-400 font-normal">(leave blank to use ADMIN_EMAIL)</span></label>
                      <input type="email" className="input" placeholder="owner@example.com" value={eodEmail} onChange={e => setEodEmail(e.target.value)} />
                    </div>
                  </div>
                </div>

                {profileError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{profileError}</p>}
                {profileSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{profileSuccess}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowProfile(false)} className="btn-ghost flex-1">Cancel</button>
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
