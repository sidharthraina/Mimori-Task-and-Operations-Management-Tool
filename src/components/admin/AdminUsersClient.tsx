'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { User, UserRole } from '@/types/database'

type UserWithLogin = User & { last_sign_in_at: string | null }

interface Props {
  initialUsers: UserWithLogin[]
  isReadOnly?: boolean
}

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'employee' as UserRole,
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

export default function AdminUsersClient({ initialUsers, isReadOnly = false }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Sort: admin → manager → staff, then alphabetically within group
  const sorted = useMemo(() =>
    [...users].sort((a, b) => {
      const roleSort = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
      return roleSort !== 0 ? roleSort : a.name.localeCompare(b.name)
    }),
    [users]
  )

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md shadow-xl">
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
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
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
              {/* Avatar */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + role + last login */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-900">{user.name}</p>
                  <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', ROLE_BADGE[user.role])}>
                    {ROLE_LABEL[user.role]}
                  </span>
                  {/* Active status badge */}
                  <span className={cn(
                    'text-xs rounded-full px-2 py-0.5 font-medium',
                    user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  )}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                {/* Last login — admin data */}
                <p className="text-xs text-gray-400 mt-0.5">
                  Last login: <span className="font-medium text-gray-500">{formatLastLogin(user.last_sign_in_at)}</span>
                </p>
              </div>

              {/* Actions */}
              {!isReadOnly && (
                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(user)}
                    className="btn-ghost text-xs text-gray-400 whitespace-nowrap"
                  >
                    {user.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </div>

            {/* Can-add-tasks toggle (non-admin users only) */}
            {!isReadOnly && user.role !== 'admin' && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">Can add tasks</p>
                  <p className="text-xs text-gray-400">Allow this user to create new tasks</p>
                </div>
                <button
                  onClick={() => handleToggleCanAddTasks(user)}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                    user.can_add_tasks ? 'bg-brand-500' : 'bg-gray-200'
                  )}
                  role="switch"
                  aria-checked={user.can_add_tasks}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                    user.can_add_tasks ? 'translate-x-4' : 'translate-x-0'
                  )} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
