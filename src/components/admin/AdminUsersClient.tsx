'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User, UserRole, Store, UserStoreAssignment } from '@/types/database'

type UserWithLogin = User & { last_sign_in_at: string | null }

interface Props {
  initialUsers: UserWithLogin[]
  stores: Store[]
  initialAssignments: Pick<UserStoreAssignment, 'user_id' | 'store_id'>[]
  isReadOnly?: boolean
}

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'employee' as UserRole,
  storeIds: [] as string[],
}

const ROLE_ORDER: Record<UserRole, number> = { admin: 0, manager: 1, employee: 2 }

const ROLE_LABEL: Record<UserRole, string> = {
  admin:    'Admin',
  manager:  'Manager',
  employee: 'Staff',
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin:    'bg-brand-100 text-brand-700',
  manager:  'bg-purple-100 text-purple-700',
  employee: 'bg-gray-100 text-gray-600',
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 2)    return 'Just now'
  if (diffMins < 60)   return `${diffMins}m ago`
  if (diffHours < 24)  return `${diffHours}h ago`
  if (diffDays === 1)  return 'Yesterday'
  if (diffDays < 7)    return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminUsersClient({ initialUsers, stores, initialAssignments, isReadOnly = false }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [assignmentSaving, setAssignmentSaving] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<UserWithLogin | null>(null)
  const [removing, setRemoving] = useState(false)

  const sorted = useMemo(() =>
    [...users].sort((a, b) => {
      const roleSort = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
      return roleSort !== 0 ? roleSort : a.name.localeCompare(b.name)
    }),
    [users]
  )

  function isAssigned(userId: string, storeId: string) {
    return assignments.some(a => a.user_id === userId && a.store_id === storeId)
  }

  async function handleToggleStoreAssignment(userId: string, storeId: string) {
    if (isReadOnly) return
    const key = `${userId}:${storeId}`
    setAssignmentSaving(key)
    const supabase = createClient()

    if (isAssigned(userId, storeId)) {
      const { error: err } = await supabase
        .from('user_store_assignments')
        .delete()
        .eq('user_id', userId)
        .eq('store_id', storeId)
      if (!err) setAssignments(prev => prev.filter(a => !(a.user_id === userId && a.store_id === storeId)))
    } else {
      const { error: err } = await supabase
        .from('user_store_assignments')
        .insert({ user_id: userId, store_id: storeId })
      if (!err) setAssignments(prev => [...prev, { user_id: userId, store_id: storeId }])
    }

    setAssignmentSaving(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to create user')
      setSaving(false)
      return
    }

    // Insert store assignments if any were selected
    if (form.storeIds.length > 0) {
      const supabase = createClient()
      await supabase.from('user_store_assignments').insert(
        form.storeIds.map(storeId => ({ user_id: json.user.id, store_id: storeId }))
      )
      setAssignments(prev => [
        ...prev,
        ...form.storeIds.map(storeId => ({ user_id: json.user.id, store_id: storeId })),
      ])
    }

    setUsers(prev => [...prev, { ...json.user, last_sign_in_at: null }])
    setSuccess(`Account created for ${form.name}`)
    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)
  }

  async function handleToggleActive(user: UserWithLogin) {
    if (isReadOnly) return
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('users')
      .update({ active: !user.active })
      .eq('id', user.id)
      .select()
      .single()
    if (!err && data) setUsers(prev => prev.map(u => u.id === user.id ? { ...data as User, last_sign_in_at: user.last_sign_in_at } : u))
  }

  async function handleRemove() {
    if (!confirmRemove) return
    setRemoving(true)
    setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: confirmRemove.id }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to remove user')
    } else {
      setUsers(prev => prev.filter(u => u.id !== confirmRemove.id))
      setAssignments(prev => prev.filter(a => a.user_id !== confirmRemove.id))
    }
    setConfirmRemove(null)
    setRemoving(false)
  }

  async function handleToggleCanAddTasks(user: UserWithLogin) {
    if (isReadOnly) return
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('users')
      .update({ can_add_tasks: !user.can_add_tasks })
      .eq('id', user.id)
      .select()
      .single()
    if (!err && data) setUsers(prev => prev.map(u => u.id === user.id ? { ...data as User, last_sign_in_at: user.last_sign_in_at } : u))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-dark-900">Cafe Staff</h1>
        {!isReadOnly && (
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Staff</button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
      )}
      {success && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3">{success}</div>
      )}

      {/* Create user modal */}
      {showForm && !isReadOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.32] backdrop-blur-sm p-4">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-bold mb-4">Add Staff Account</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Full name *</label>
                <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Password *</label>
                <input type="password" className="input" required minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                  <option value="employee">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {stores.length > 0 && (
                <div>
                  <label className="label">Store Access</label>
                  {form.storeIds.length === 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                      No store selected — this person won't see any tasks until assigned.
                    </p>
                  )}
                  <div className="space-y-2">
                    {stores.map(store => (
                      <label key={store.id} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.storeIds.includes(store.id)}
                          onChange={e => setForm(f => ({
                            ...f,
                            storeIds: e.target.checked
                              ? [...f.storeIds, store.id]
                              : f.storeIds.filter(id => id !== store.id),
                          }))}
                          className="w-4 h-4 rounded accent-brand-500 flex-shrink-0"
                        />
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: store.color }} />
                        <span className="text-sm text-gray-700">{store.name}</span>
                        {store.is_default && <span className="text-xs text-gray-400">(default)</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Creating…' : 'Create account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        {sorted.map(user => (
          <div key={user.id} className={cn('card', !user.active && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-900">{user.name}</p>
                  <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', ROLE_BADGE[user.role])}>
                    {ROLE_LABEL[user.role]}
                  </span>
                  <span className={cn(
                    'text-xs rounded-full px-2 py-0.5 font-medium',
                    user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  )}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Last login: <span className="font-medium text-gray-500">{formatLastLogin(user.last_sign_in_at)}</span>
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Expand store assignments */}
                {stores.length > 0 && !isReadOnly && (
                  <button
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                    className="btn-ghost text-xs text-gray-400"
                    title="Manage store access"
                  >
                    <svg className={cn('w-4 h-4 transition-transform', expandedUser === user.id && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {/* Deactivate/Activate — staff and manager only, not admin */}
                {!isReadOnly && user.role !== 'admin' && (
                  <button onClick={() => handleToggleActive(user)} className="btn-ghost text-xs text-gray-400 whitespace-nowrap">
                    {user.active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
                {/* Remove — staff and manager only */}
                {!isReadOnly && user.role !== 'admin' && (
                  <button
                    onClick={() => setConfirmRemove(user)}
                    className="btn-ghost text-xs text-red-400 hover:text-red-600 whitespace-nowrap"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Can-add-tasks toggle */}
            {!isReadOnly && user.role !== 'admin' && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">Can add tasks</p>
                  <p className="text-xs text-gray-400">Allow this user to create new tasks</p>
                </div>
                <button
                  onClick={() => handleToggleCanAddTasks(user)}
                  className={cn(
                    'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200',
                    user.can_add_tasks ? 'bg-brand-500 border-brand-500' : 'bg-gray-50 border-gray-400'
                  )}
                  role="switch"
                  aria-checked={user.can_add_tasks}
                >
                  <span className={cn(
                    'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                    user.can_add_tasks ? 'left-6 w-6 h-6 bg-white' : 'left-1 w-4 h-4 bg-gray-400'
                  )} />
                </button>
              </div>
            )}

            {/* Store assignment section */}
            {expandedUser === user.id && stores.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Store Access</p>
                <div className="space-y-1.5">
                  {stores.map(store => {
                    const assigned = isAssigned(user.id, store.id)
                    const key = `${user.id}:${store.id}`
                    const busy = assignmentSaving === key
                    return (
                      <div key={store.id} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: store.color }} />
                          <span className="text-sm text-gray-700">{store.name}</span>
                          {store.is_default && <span className="text-[10px] text-gray-400">Default</span>}
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => handleToggleStoreAssignment(user.id, store.id)}
                          className={cn(
                            'relative flex-shrink-0 h-8 w-[52px] rounded-full border-2 transition-all duration-200 disabled:opacity-50',
                            assigned ? 'bg-brand-500 border-brand-500' : 'bg-gray-50 border-gray-400'
                          )}
                          role="switch"
                          aria-checked={assigned}
                        >
                          <span className={cn(
                            'absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200',
                            assigned ? 'left-6 w-6 h-6 bg-white' : 'left-1 w-4 h-4 bg-gray-400'
                          )} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Remove confirmation dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.32] backdrop-blur-sm p-4">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-lg">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Remove {confirmRemove.name}?</h2>
            <p className="text-sm text-gray-500 mb-1">
              This will permanently delete their account and remove them from all stores.
            </p>
            <p className="text-xs text-gray-400 mb-6">Their completed task records will be preserved.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                disabled={removing}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
