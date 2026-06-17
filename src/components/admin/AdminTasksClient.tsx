'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, cn } from '@/lib/utils'
import type { Task, TaskCategory } from '@/types/database'

const CATEGORIES: TaskCategory[] = ['Opening', 'Setup', 'Prep', 'Cleaning', 'Closing', 'Other']

interface Props {
  initialTasks: Task[]
  isReadOnly?: boolean
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'Opening' as TaskCategory,
  scheduled_time: '08:00',
  frequency: 'daily' as const,
  active: true,
}

export default function AdminTasksClient({ initialTasks, isReadOnly = false }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setForm({
      title: task.title,
      description: task.description ?? '',
      category: task.category,
      scheduled_time: task.scheduled_time,
      frequency: task.frequency,
      active: task.active,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      scheduled_time: form.scheduled_time,
      frequency: form.frequency,
      active: form.active,
    }

    if (editing) {
      const { data, error: err } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', editing.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setTasks(prev => prev.map(t => t.id === editing.id ? data as Task : t))
    } else {
      const { data, error: err } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setTasks(prev => [...prev, data as Task])
    }

    setSaving(false)
    setShowForm(false)
  }

  async function handleToggleActive(task: Task) {
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('tasks')
      .update({ active: !task.active })
      .eq('id', task.id)
      .select()
      .single()
    if (!err && data) setTasks(prev => prev.map(t => t.id === task.id ? data as Task : t))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark-900">Task Master List</h1>
          {isReadOnly && <p className="text-xs text-gray-400 mt-0.5">View only</p>}
        </div>
        {!isReadOnly && <button onClick={openNew} className="btn-primary">+ Add Task</button>}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="card w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Task' : 'New Task'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category *</label>
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as TaskCategory }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Scheduled time *</label>
                  <input type="time" className="input" required value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded accent-brand-500"
                />
                <label htmlFor="active" className="text-sm text-gray-700">Active (included in daily checklist)</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map(task => (
          <div
            key={task.id}
            className={cn('card flex items-center gap-3', !task.active && 'opacity-50')}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">{task.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {task.category} · {formatTime(task.scheduled_time)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-xs rounded-full px-2 py-0.5', task.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                {task.active ? 'Active' : 'Inactive'}
              </span>
              {!isReadOnly && (
                <>
                  <button onClick={() => openEdit(task)} className="btn-ghost text-xs">Edit</button>
                  <button onClick={() => handleToggleActive(task)} className="btn-ghost text-xs text-gray-400">
                    {task.active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-gray-400 py-10">No tasks yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}
