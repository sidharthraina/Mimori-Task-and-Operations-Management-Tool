'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Store } from '@/types/database'

const COLORS = [
  { label: 'Amber',  hex: '#d6721e' },
  { label: 'Blue',   hex: '#2563eb' },
  { label: 'Green',  hex: '#16a34a' },
  { label: 'Purple', hex: '#9333ea' },
  { label: 'Red',    hex: '#dc2626' },
  { label: 'Cyan',   hex: '#0891b2' },
  { label: 'Rose',   hex: '#e11d48' },
  { label: 'Slate',  hex: '#475569' },
]

const EMPTY_FORM = { name: '', address: '', color: '#d6721e' }

interface Props {
  initialStores: Store[]
}

export default function AdminStoresClient({ initialStores }: Props) {
  const router = useRouter()
  const [stores, setStores] = useState(initialStores)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Store | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(store: Store) {
    setEditing(store)
    setForm({ name: store.name, address: store.address ?? '', color: store.color })
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      color: form.color,
    }

    if (editing) {
      const { data, error: err } = await supabase
        .from('stores')
        .update(payload)
        .eq('id', editing.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setStores(prev => prev.map(s => s.id === editing.id ? data as Store : s))
    } else {
      const { data, error: err } = await supabase
        .from('stores')
        .insert({ ...payload, is_default: stores.length === 0 })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setStores(prev => [...prev, data as Store])
    }

    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function handleSetDefault(storeId: string) {
    const supabase = createClient()
    await supabase.from('stores').update({ is_default: false }).eq('is_default', true)
    const { error: err } = await supabase
      .from('stores')
      .update({ is_default: true })
      .eq('id', storeId)
    if (err) { setError(err.message); return }

    setStores(prev => prev.map(s => ({ ...s, is_default: s.id === storeId })))
    // Switch the active-store cookie to the new default
    document.cookie = `active-store-id=${storeId}; path=/; max-age=2592000; SameSite=Lax`
    router.refresh()
  }

  async function handleDelete(storeId: string) {
    const supabase = createClient()
    const { error: err } = await supabase.from('stores').delete().eq('id', storeId)
    if (err) {
      setError(err.code === '23503'
        ? 'Cannot delete a store that still has tasks. Remove or reassign its tasks first.'
        : err.message
      )
      setConfirmDelete(null)
      return
    }
    setStores(prev => prev.filter(s => s.id !== storeId))
    setConfirmDelete(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark-900">Stores</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage locations and their task lists</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add Store</button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Store list */}
      <div className="space-y-3">
        {stores.map(store => (
          <div
            key={store.id}
            className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-4 border-l-4"
            style={{ borderLeftColor: store.color }}
          >
            {/* Color dot + name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: store.color }} />
                <p className="font-semibold text-sm text-gray-900">{store.name}</p>
                {store.is_default && (
                  <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-brand-100 text-brand-700">Default</span>
                )}
              </div>
              {store.address && (
                <p className="text-xs text-gray-400 mt-0.5 ml-5">{store.address}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!store.is_default && (
                <button
                  onClick={() => handleSetDefault(store.id)}
                  className="btn-ghost text-xs text-gray-500"
                >
                  Set default
                </button>
              )}
              <button onClick={() => openEdit(store)} className="btn-ghost text-xs">Edit</button>
              {!store.is_default && stores.length > 1 && (
                <button
                  onClick={() => setConfirmDelete(store.id)}
                  className="btn-ghost text-xs text-red-400 hover:text-red-600"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}

        {stores.length === 0 && (
          <p className="text-center text-gray-400 py-10">No stores yet. Add one above.</p>
        )}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.32] backdrop-blur-sm p-4">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Store' : 'Add Store'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">Store name *</label>
                <input
                  className="input" required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Mimori - Downtown"
                />
              </div>
              <div>
                <label className="label">Address <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  className="input"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St, City"
                />
              </div>
              <div>
                <label className="label">Theme colour</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {COLORS.map(c => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, color: c.hex }))}
                      className={cn(
                        'w-8 h-8 rounded-full transition-transform hover:scale-110',
                        form.color === c.hex ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : ''
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Selected: <span className="font-medium" style={{ color: form.color }}>{COLORS.find(c => c.hex === form.color)?.label ?? form.color}</span>
                </p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.32] backdrop-blur-sm p-4">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-lg">
            <h2 className="text-lg font-bold mb-2">Delete store?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove the store and unassign all staff. Tasks must be removed first.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
