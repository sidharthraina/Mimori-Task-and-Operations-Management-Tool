'use client'

import { cn } from '@/lib/utils'
import type { TaskCategory, RecurrenceUnit, EscalationRuleWithTiers } from '@/types/database'

const CATEGORIES: TaskCategory[] = ['Opening', 'Setup', 'Prep', 'Cleaning', 'Closing', 'Other']

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export interface TaskFormValue {
  title: string
  description: string
  category: TaskCategory
  scheduled_time: string
  active: boolean
  recurrence_unit: RecurrenceUnit
  recurrence_interval: number
  recurrence_weekdays: number[]
  recurrence_anchor_date: string
  assigned_user_id: string | null
  require_photo: boolean
  require_notes: boolean
  escalation_rule_id: string | null
}

export function emptyTaskForm(): TaskFormValue {
  return {
    title: '',
    description: '',
    category: 'Opening',
    scheduled_time: '08:00',
    active: true,
    recurrence_unit: 'day',
    recurrence_interval: 1,
    recurrence_weekdays: [],
    recurrence_anchor_date: new Date().toISOString().slice(0, 10),
    assigned_user_id: null,
    require_photo: false,
    require_notes: false,
    escalation_rule_id: null,
  }
}

interface Roster {
  id: string
  name: string
}

interface Props {
  value: TaskFormValue
  onChange: (patch: Partial<TaskFormValue>) => void
  roster: Roster[]
  escalationRules?: EscalationRuleWithTiers[]
}

export default function TaskFormFields({ value, onChange, roster, escalationRules = [] }: Props) {
  function toggleWeekday(day: number) {
    const set = new Set(value.recurrence_weekdays)
    if (set.has(day)) set.delete(day)
    else set.add(day)
    onChange({ recurrence_weekdays: [...set].sort((a, b) => a - b) })
  }

  return (
    <>
      <div>
        <label className="label">Title *</label>
        <input className="input" required value={value.title} onChange={e => onChange({ title: e.target.value })} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input resize-none" rows={2} value={value.description} onChange={e => onChange({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Category *</label>
          <select className="input" value={value.category} onChange={e => onChange({ category: e.target.value as TaskCategory })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Scheduled time *</label>
          <input type="time" className="input" required value={value.scheduled_time} onChange={e => onChange({ scheduled_time: e.target.value })} />
        </div>
      </div>

      {/* Recurrence */}
      <div className="border-t border-outlineVariant pt-4">
        <p className="label mb-3">Frequency</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Repeats every</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                className="input w-20"
                value={value.recurrence_interval}
                onChange={e => onChange({ recurrence_interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
              <select
                className="input flex-1"
                value={value.recurrence_unit}
                onChange={e => onChange({ recurrence_unit: e.target.value as RecurrenceUnit, recurrence_weekdays: [] })}
              >
                <option value="day">day(s)</option>
                <option value="week">week(s)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Starting</label>
            <input
              type="date"
              className="input"
              value={value.recurrence_anchor_date}
              onChange={e => onChange({ recurrence_anchor_date: e.target.value })}
            />
          </div>
        </div>
        {value.recurrence_unit === 'week' && (
          <div className="mt-3">
            <label className="label">
              On these days <span className="text-onSurfaceVariant/70 font-normal normal-case tracking-normal">(optional — defaults to the start date&apos;s weekday)</span>
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={cn(
                    'w-9 h-9 rounded-full text-xs font-medium border-2 transition-colors',
                    value.recurrence_weekdays.includes(d.value)
                      ? 'bg-primary border-primary text-onPrimary'
                      : 'bg-surface border-outline text-onSurfaceVariant hover:border-primary/60'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assignment */}
      <div className="border-t border-outlineVariant pt-4">
        <label className="label">Assign to</label>
        <select
          className="input"
          value={value.assigned_user_id ?? ''}
          onChange={e => onChange({ assigned_user_id: e.target.value || null })}
        >
          <option value="">Open — anyone can complete</option>
          {roster.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* Proof requirements */}
      <div className="border-t border-outlineVariant pt-4 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox" className="w-4 h-4 rounded accent-primary"
            checked={value.require_photo}
            onChange={e => onChange({ require_photo: e.target.checked })}
          />
          <span className="text-sm text-onSurface">Require a photo to mark done</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox" className="w-4 h-4 rounded accent-primary"
            checked={value.require_notes}
            onChange={e => onChange({ require_notes: e.target.checked })}
          />
          <span className="text-sm text-onSurface">Require notes to mark done</span>
        </label>
      </div>

      {/* Escalation override */}
      {escalationRules.length > 0 && (
        <div className="border-t border-outlineVariant pt-4">
          <label className="label">Escalation chain</label>
          <select
            className="input"
            value={value.escalation_rule_id ?? ''}
            onChange={e => onChange({ escalation_rule_id: e.target.value || null })}
          >
            <option value="">Store default</option>
            {escalationRules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-outlineVariant pt-4">
        <input
          type="checkbox" id="task-active"
          checked={value.active}
          onChange={e => onChange({ active: e.target.checked })}
          className="w-4 h-4 rounded accent-primary"
        />
        <label htmlFor="task-active" className="text-sm text-onSurface">Active (included in checklist)</label>
      </div>
    </>
  )
}
