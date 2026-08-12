'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, cn } from '@/lib/utils'
import { describeRecurrence } from '@/lib/recurrence'
import TaskFormFields, { emptyTaskForm, type TaskFormValue } from './TaskFormFields'
import type { Task, EscalationRuleWithTiers } from '@/types/database'

interface Roster {
  id: string
  name: string
}

interface Props {
  initialTasks: Task[]
  isReadOnly?: boolean
  storeId: string
  roster: Roster[]
  escalationRules?: EscalationRuleWithTiers[]
}

function taskToForm(task: Task): TaskFormValue {
  return {
    title: task.title,
    description: task.description ?? '',
    category: task.category,
    scheduled_time: task.scheduled_time,
    active: task.active,
    recurrence_unit: task.recurrence_unit,
    recurrence_interval: task.recurrence_interval,
    recurrence_weekdays: task.recurrence_weekdays ?? [],
    recurrence_anchor_date: task.recurrence_anchor_date,
    assigned_user_id: task.assigned_user_id,
    require_photo: task.require_photo,
    require_notes: task.require_notes,
    escalation_rule_id: task.escalation_rule_id,
  }
}

export default function AdminTasksClient({ initialTasks, isReadOnly = false, storeId, roster, escalationRules = [] }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patchForm(patch: Partial<TaskFormValue>) {
    setForm(f => ({ ...f, ...patch }))
  }

  function openNew() {
    setEditing(null)
    setForm(emptyTaskForm())
    setShowForm(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setForm(taskToForm(task))
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
      frequency: 'daily' as const,
      active: form.active,
      store_id: storeId,
      recurrence_unit: form.recurrence_unit,
      recurrence_interval: form.recurrence_interval,
      recurrence_weekdays: form.recurrence_weekdays.length > 0 ? form.recurrence_weekdays : null,
      recurrence_anchor_date: form.recurrence_anchor_date,
      assigned_user_id: form.assigned_user_id,
      require_photo: form.require_photo,
      require_notes: form.require_notes,
      escalation_rule_id: form.escalation_rule_id,
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

  function assigneeName(userId: string | null) {
    if (!userId) return null
    return roster.find(u => u.id === userId)?.name ?? null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading text-onSurface">Task Master List</h1>
          {isReadOnly && <p className="text-xs text-onSurfaceVariant/70 mt-0.5">View only</p>}
        </div>
        {!isReadOnly && <button onClick={openNew} className="btn-primary">+ Add Task</button>}
      </div>

      {error && (
        <div className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-onSurface/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="modal-surface p-6 w-full max-w-lg my-8 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-heading mb-4 text-onSurface">{editing ? 'Edit Task' : 'New Task'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <TaskFormFields value={form} onChange={patchForm} roster={roster} escalationRules={escalationRules} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
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
        {tasks.map(task => {
          const assignee = assigneeName(task.assigned_user_id)
          return (
            <div
              key={task.id}
              className={cn('card flex items-center gap-3', !task.active && 'opacity-50')}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-onSurface truncate">{task.title}</p>
                <p className="text-xs text-onSurfaceVariant/70 mt-0.5">
                  {task.category} · {formatTime(task.scheduled_time)} · {describeRecurrence(task)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-xs rounded-full px-2 py-0.5 bg-surfaceContainer text-onSurfaceVariant">
                    {assignee ? `→ ${assignee}` : 'Open'}
                  </span>
                  {task.require_photo && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-secondaryContainer text-onSecondaryContainer">Photo required</span>
                  )}
                  {task.require_notes && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-tertiaryContainer text-onTertiaryContainer">Notes required</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('text-xs rounded-full px-2 py-0.5', task.active ? 'bg-successContainer text-onSuccessContainer' : 'bg-surfaceContainer text-onSurfaceVariant')}>
                  {task.active ? 'Active' : 'Inactive'}
                </span>
                {!isReadOnly && (
                  <>
                    <button onClick={() => openEdit(task)} className="btn-ghost text-xs">Edit</button>
                    <button onClick={() => handleToggleActive(task)} className="btn-ghost text-xs text-onSurfaceVariant/70">
                      {task.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {tasks.length === 0 && (
          <p className="text-center text-onSurfaceVariant/70 py-10">No tasks yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}
