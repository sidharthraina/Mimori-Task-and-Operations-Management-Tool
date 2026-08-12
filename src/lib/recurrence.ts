import type { Task } from '@/types/database'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type RecurrenceFields = Pick<Task, 'recurrence_unit' | 'recurrence_interval' | 'recurrence_weekdays' | 'recurrence_anchor_date'>

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

function startOfWeek(d: Date): Date {
  // Monday-anchored (ISO), matching Postgres date_trunc('week', ...) — note this is
  // independent of the Sun=0..Sat=6 weekday numbering used for recurrence_weekdays below.
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const daysSinceMonday = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - daysSinceMonday)
  return out
}

// Positive modulo (JS `%` can return negative results)
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/**
 * TS mirror of public.is_task_due() in supabase/migrations/007_recurrence_and_assignment.sql.
 * KEEP IN SYNC WITH: that SQL function — used by the Edge Function via RPC instead of this file,
 * so any change to the due-date rule must be made in both places.
 */
export function isTaskDueOn(task: RecurrenceFields, dateStr: string): boolean {
  // Defensive fallback: if recurrence columns aren't present yet (e.g. migration
  // 007 hasn't been applied), treat the task as due every day — the pre-recurrence behavior.
  if (!task.recurrence_unit || !task.recurrence_anchor_date) return true

  const check = new Date(dateStr + 'T00:00:00')
  const anchor = new Date(task.recurrence_anchor_date + 'T00:00:00')
  if (check < anchor) return false

  const interval = Math.max(task.recurrence_interval ?? 1, 1)

  if (task.recurrence_unit === 'day') {
    return mod(daysBetween(anchor, check), interval) === 0
  }

  // week
  const weeksSinceAnchor = Math.floor(daysBetween(startOfWeek(anchor), startOfWeek(check)) / 7)
  const onInterval = mod(weeksSinceAnchor, interval) === 0

  if (task.recurrence_weekdays && task.recurrence_weekdays.length > 0) {
    return onInterval && task.recurrence_weekdays.includes(check.getDay())
  }
  return onInterval && check.getDay() === anchor.getDay()
}

/** Human-readable recurrence summary for badges, e.g. "Every 3 days" / "Every 2 weeks on Mon, Wed" */
export function describeRecurrence(task: RecurrenceFields): string {
  const interval = Math.max(task.recurrence_interval ?? 1, 1)

  if (task.recurrence_unit === 'day') {
    return interval === 1 ? 'Daily' : `Every ${interval} days`
  }

  const weekLabel = interval === 1 ? 'Every week' : `Every ${interval} weeks`
  if (task.recurrence_weekdays && task.recurrence_weekdays.length > 0) {
    const days = [...task.recurrence_weekdays].sort().map(d => WEEKDAY_LABELS[d]).join(', ')
    return `${weekLabel} on ${days}`
  }
  return weekLabel
}
