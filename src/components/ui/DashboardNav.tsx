'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User, Store } from '@/types/database'
import ProfileNotificationsSection from './ProfileNotificationsSection'
import ProfileSettingsSection from './ProfileSettingsSection'

interface Props {
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'can_add_tasks' |
    'notif_individual_missed' | 'notif_batched_missed' | 'eod_report_time' | 'eod_report_email'>
  notificationCount?: number
  stores: Store[]
  activeStore: Store | null
  businessName?: string
  logoUrl?: string | null
}

type ProfileTab = 'account' | 'notifications' | 'alerts' | 'settings'

// Canonical role → badge class mapping. AdminUsersClient.tsx must use the same mapping.
const ROLE_BADGE_CLASS: Record<'admin' | 'manager' | 'employee', string> = {
  admin: 'badge-role-admin',
  manager: 'badge-role-manager',
  employee: 'badge-role-employee',
}

export default function DashboardNav({ user, notificationCount = 0, stores, activeStore, businessName = 'Mimori', logoUrl = null }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [count, setCount] = useState(notificationCount)
  const [showProfile, setShowProfile] = useState(false)
  const [profileTab, setProfileTab] = useState<ProfileTab>('account')
  const [storeOpen, setStoreOpen] = useState(false)
  const [currentStore, setCurrentStore] = useState(activeStore)

  useEffect(() => { setMounted(true) }, [])

  // Account fields
  const [name, setName] = useState(user.name)
  const [newPassword, setNewPassword] = useState('')

  // Email alert preferences
  const [notifIndividual, setNotifIndividual] = useState(user.notif_individual_missed)
  const [notifBatched, setNotifBatched] = useState(user.notif_batched_missed)
  const [eodTime, setEodTime] = useState(user.eod_report_time ?? '22:00')
  const [eodEmail, setEodEmail] = useState(user.eod_report_email ?? '')

  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  // Once a tab's form saves successfully, its Save button turns into Close
  // until the user edits that tab's fields again — no auto-close timer.
  const [accountSaved, setAccountSaved] = useState(false)
  const [alertsSaved, setAlertsSaved] = useState(false)

  const isAdmin   = user.role === 'admin'
  const isManager = user.role === 'manager'
  const showStoreSwitcher = isAdmin || stores.length > 1

  const roleKey: 'admin' | 'manager' | 'employee' = isAdmin ? 'admin' : isManager ? 'manager' : 'employee'
  const roleLabel = isAdmin ? 'Admin' : isManager ? 'Manager' : 'Staff'

  const sidebarItems: { key: ProfileTab; label: string; show: boolean }[] = [
    { key: 'account',       label: 'Account',       show: true },
    { key: 'notifications', label: 'Notifications', show: isAdmin || isManager },
    { key: 'alerts',        label: 'Email Alerts',  show: isAdmin },
    { key: 'settings',      label: 'Settings',      show: isAdmin },
  ]

  function openProfile(tab: ProfileTab = 'account') {
    setProfileTab(tab)
    setProfileError(null)
    setProfileSuccess(null)
    setAccountSaved(false)
    setAlertsSaved(false)
    setShowProfile(true)
  }

  // Clears the stale success/error message and reverts Close back to Save
  // the moment the user edits a field again.
  function markAccountDirty() {
    setAccountSaved(false)
    setProfileSuccess(null)
    setProfileError(null)
  }
  function markAlertsDirty() {
    setAlertsSaved(false)
    setProfileSuccess(null)
    setProfileError(null)
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

    setNewPassword('')
    setSaving(false)
    setProfileSuccess('Profile updated.')
    setAccountSaved(true)
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
    setSaving(false)
    setProfileSuccess('Notification settings saved.')
    setAlertsSaved(true)
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const navLinkClass = (href: string) => cn(
    'btn-ghost whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    isActive(href)
      ? 'bg-primaryContainer text-onPrimaryContainer'
      : 'text-onSurfaceVariant hover:bg-surfaceContainer hover:text-onSurface'
  )

  const accentColor = currentStore?.color ?? '#d6721e'

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-outlineVariant bg-surface relative">
        {/* Store colour accent strip */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] transition-colors duration-300" style={{ backgroundColor: accentColor }} />

        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href={isAdmin || isManager ? '/admin' : '/tasks'} className="flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-8 w-auto object-contain" />
            ) : (
              <span
                className="text-onSurface leading-none font-display"
                style={{ fontSize: 32 }}
              >
                {businessName}
              </span>
            )}
          </Link>

          {/* Store switcher — fixed width so store-name length never shifts the nav links beside it */}
          {showStoreSwitcher && (
            <div className="relative flex-shrink-0 w-48">
              <button
                onClick={() => setStoreOpen(o => !o)}
                className="flex w-full items-center gap-1.5 rounded-lg border border-outline bg-surface px-2.5 py-1.5 text-xs font-medium text-onSurfaceVariant hover:bg-surfaceContainer transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
                <span className="flex-1 min-w-0 truncate text-left">{currentStore?.name ?? 'Select store'}</span>
                <svg className={cn('w-3 h-3 flex-shrink-0 text-onSurfaceVariant/60 transition-transform', storeOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {storeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStoreOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-outlineVariant bg-surfaceContainerLowest shadow-elevation-2 overflow-hidden">
                    {stores.map(store => (
                      <button
                        key={store.id}
                        onClick={() => handleStoreSwitch(store)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surfaceContainer',
                          store.id === currentStore?.id && 'bg-surfaceContainer'
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: store.color }} />
                        <span className="flex-1 truncate text-onSurface">{store.name}</span>
                        {store.is_default && (
                          <span className="text-[10px] text-onSurfaceVariant/70 font-medium">Default</span>
                        )}
                        {store.id === currentStore?.id && (
                          <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                    {isAdmin && (
                      <>
                        <div className="border-t border-outlineVariant" />
                        <Link
                          href="/admin/stores"
                          onClick={() => setStoreOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-onSurfaceVariant hover:bg-surfaceContainer transition-colors"
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

          {/* Nav links — desktop only. Labels are fixed app copy, not user data, so their widths never change. */}
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
            {isAdmin && (
              <Link href="/admin/escalation" className={navLinkClass('/admin/escalation')}>Escalation</Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notification bell (admin + manager — both can be escalation-tier recipients) — opens Profile on the Notifications section */}
            {(isAdmin || isManager) && (
              <button
                onClick={() => openProfile('notifications')}
                title={count > 0 ? `${count} notification${count > 1 ? 's' : ''}` : 'No notifications'}
                className="relative p-2 rounded-full hover:bg-surfaceContainer transition-colors"
              >
                <svg className={cn('w-5 h-5', count > 0 ? 'text-error' : 'text-onSurfaceVariant/60')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-error text-onError text-[9px] font-bold flex items-center justify-center px-0.5">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            )}

            {/* Profile button — Settings & Sign out now live inside here. Name column is a fixed width so short/long names don't resize the button. */}
            <button
              onClick={() => openProfile('account')}
              className="hidden sm:flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surfaceContainer transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primaryContainer flex items-center justify-center text-onPrimaryContainer font-bold text-xs flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left w-[110px]">
                <div className="text-sm text-onSurface truncate leading-tight">{user.name}</div>
                <span className={cn(ROLE_BADGE_CLASS[roleKey], 'mt-0.5 !px-1.5 !py-0 text-[10px] leading-tight')}>
                  {roleLabel}
                </span>
              </div>
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setShowMobileMenu(v => !v)}
              className="sm:hidden p-2 rounded-full hover:bg-surfaceContainer transition-colors"
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            >
              {showMobileMenu ? (
                <svg className="w-5 h-5 text-onSurface" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-onSurface" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav menu */}
        {showMobileMenu && (
          <div className="sm:hidden border-t border-outlineVariant px-4 py-3 space-y-1">
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
            {isAdmin && (
              <Link href="/admin/escalation" onClick={() => setShowMobileMenu(false)} className={cn(navLinkClass('/admin/escalation'), 'w-full justify-start')}>Escalation</Link>
            )}
            <div className="pt-3 border-t border-outlineVariant">
              <button
                onClick={() => { openProfile('account'); setShowMobileMenu(false) }}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-primaryContainer flex items-center justify-center text-onPrimaryContainer font-bold text-sm flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-onSurface">{user.name}</div>
                  <div className="text-xs text-onSurfaceVariant flex items-center gap-1.5">
                    <span className={ROLE_BADGE_CLASS[roleKey]}>{roleLabel}</span>
                    <span>· tap to open profile</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-onSurface/40 backdrop-blur-sm p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="modal-surface p-5 sm:p-6 w-full max-w-2xl flex gap-5 max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Sidebar */}
            <div className="w-28 sm:w-40 flex-shrink-0 flex flex-col">
              <h2 className="text-base sm:text-lg font-bold text-onSurface mb-4 px-1">Profile</h2>
              <nav className="space-y-0.5 flex-1">
                {sidebarItems.filter(i => i.show).map(item => (
                  <button
                    key={item.key}
                    onClick={() => { setProfileTab(item.key); setProfileError(null); setProfileSuccess(null) }}
                    className={cn(
                      'w-full text-left text-sm rounded-lg px-3 py-2 transition-colors',
                      profileTab === item.key ? 'bg-primaryContainer text-onPrimaryContainer font-medium' : 'text-onSurfaceVariant hover:bg-surfaceContainer'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="border-t border-outlineVariant pt-2 mt-2 space-y-0.5">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left text-sm rounded-lg px-3 py-2 text-error hover:bg-error/8 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 overflow-y-auto pr-1">
              <button
                onClick={() => setShowProfile(false)}
                className="float-right w-9 h-9 -mt-1 -mr-1 rounded-full hover:bg-surfaceContainer flex items-center justify-center text-onSurfaceVariant hover:text-onSurface transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Account */}
              {profileTab === 'account' && (
                <form onSubmit={handleSaveAccount} className="space-y-4 max-w-sm">
                  <div>
                    <label className="label">Display name</label>
                    <input className="input" required value={name} onChange={e => { setName(e.target.value); markAccountDirty() }} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input bg-surfaceContainerLow text-onSurfaceVariant/60 cursor-not-allowed" value={user.email} disabled />
                    <p className="text-xs text-onSurfaceVariant/70 mt-1">Email changes require admin action</p>
                  </div>
                  <div>
                    <label className="label">New password</label>
                    <input
                      type="password" className="input"
                      placeholder="Leave blank to keep current"
                      minLength={8} value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); markAccountDirty() }}
                    />
                  </div>

                  {/* Appearance — theme toggle lives here, deliberately kept out of the primary nav bar */}
                  <div>
                    <label className="label">Appearance</label>
                    <div className="inline-flex rounded-full border border-outline p-0.5 gap-0.5">
                      {(['light', 'dark', 'system'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setTheme(opt)}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                            mounted && theme === opt
                              ? 'bg-primary text-onPrimary'
                              : 'text-onSurfaceVariant hover:bg-surfaceContainer'
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {profileError && <p className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-3 py-2">{profileError}</p>}
                  {profileSuccess && (
                    <p className="text-sm text-onSuccessContainer bg-successContainer rounded-xl px-3 py-2">
                      {profileSuccess} {accountSaved && '— you can close this now.'}
                    </p>
                  )}
                  <div className="flex justify-end pt-1">
                    {accountSaved ? (
                      <button type="button" onClick={() => setShowProfile(false)} className="btn-primary">Close</button>
                    ) : (
                      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
                    )}
                  </div>
                </form>
              )}

              {/* Notifications — real alert feed */}
              {profileTab === 'notifications' && (isAdmin || isManager) && (
                <ProfileNotificationsSection isAdmin={isAdmin} isManager={isManager} onCountChange={setCount} />
              )}

              {/* Email alert preferences (admin only) */}
              {profileTab === 'alerts' && isAdmin && (
                <form onSubmit={handleSaveNotifications} className="space-y-5 max-w-sm">
                  <div>
                    <p className="label mb-3">Missed Task Alerts</p>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-onSurface">Individual emails</p>
                          <p className="text-xs text-onSurfaceVariant/70 mt-0.5">One email per missed task as soon as it&apos;s detected</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setNotifIndividual(v => !v); markAlertsDirty() }}
                          className={cn(
                            'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200',
                            notifIndividual ? 'bg-primary border-primary' : 'bg-surfaceContainerHigh border-outline'
                          )}
                          role="switch"
                          aria-checked={notifIndividual}
                        >
                          <span className={cn(
                            'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                            notifIndividual ? 'left-6 w-6 h-6 bg-onPrimary' : 'left-1 w-4 h-4 bg-onSurfaceVariant'
                          )} />
                        </button>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-onSurface">Batched emails</p>
                          <p className="text-xs text-onSurfaceVariant/70 mt-0.5">One email per check run, grouping all newly missed tasks</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setNotifBatched(v => !v); markAlertsDirty() }}
                          className={cn(
                            'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200',
                            notifBatched ? 'bg-primary border-primary' : 'bg-surfaceContainerHigh border-outline'
                          )}
                          role="switch"
                          aria-checked={notifBatched}
                        >
                          <span className={cn(
                            'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                            notifBatched ? 'left-6 w-6 h-6 bg-onPrimary' : 'left-1 w-4 h-4 bg-onSurfaceVariant'
                          )} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-outlineVariant pt-4">
                    <p className="label mb-3">End of Day Report</p>
                    <p className="text-xs text-onSurfaceVariant/70 mb-3">Sent daily with a full breakdown — counts, categories, who completed what, and missed tasks.</p>
                    <div className="space-y-3">
                      <div>
                        <label className="label">Send time</label>
                        <input type="time" className="input w-36" value={eodTime} onChange={e => { setEodTime(e.target.value); markAlertsDirty() }} />
                      </div>
                      <div>
                        <label className="label">Report email <span className="text-onSurfaceVariant/70 font-normal normal-case tracking-normal">(leave blank to use ADMIN_EMAIL)</span></label>
                        <input type="email" className="input" placeholder="owner@example.com" value={eodEmail} onChange={e => { setEodEmail(e.target.value); markAlertsDirty() }} />
                      </div>
                    </div>
                  </div>

                  {profileError && <p className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-3 py-2">{profileError}</p>}
                  {profileSuccess && (
                    <p className="text-sm text-onSuccessContainer bg-successContainer rounded-xl px-3 py-2">
                      {profileSuccess} {alertsSaved && '— you can close this now.'}
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    {alertsSaved ? (
                      <button type="button" onClick={() => setShowProfile(false)} className="btn-primary">Close</button>
                    ) : (
                      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
                    )}
                  </div>
                </form>
              )}

              {/* Branding settings (admin only) */}
              {profileTab === 'settings' && isAdmin && (
                <ProfileSettingsSection initialBusinessName={businessName} initialLogoUrl={logoUrl} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
