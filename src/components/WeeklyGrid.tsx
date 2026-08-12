'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatTime, isOverdue, CATEGORY_ORDER, todayISO } from '@/lib/utils'
import { isTaskDueOn } from '@/lib/recurrence'
import { getCurrentPosition, distanceMeters } from '@/lib/geo'
import type { Task, TaskLog, TaskCategory, User, Store } from '@/types/database'
import CameraCapture from '@/components/CameraCapture'
import TaskFormFields, { emptyTaskForm, type TaskFormValue } from '@/components/admin/TaskFormFields'

type EffectiveStatus = 'upcoming' | 'pending' | 'missed' | 'done'

function computeDateStatus(task: Task, log: TaskLog | undefined, dateStr: string, today: string): EffectiveStatus {
  if (log?.status === 'done') return 'done'
  if (log?.status === 'missed') return 'missed'
  if (dateStr < today) return 'missed'   // past date, not done = missed
  if (!task.scheduled_time) return 'upcoming'
  const now = new Date()
  const parts = task.scheduled_time.split(':').map(Number)
  const scheduled = new Date()
  scheduled.setHours(parts[0] ?? 0, parts[1] ?? 0, 0, 0)
  const missedAt = new Date(scheduled.getTime() + 30 * 60 * 1000)
  if (now < scheduled) return 'upcoming'
  if (now < missedAt) return 'pending'
  return 'missed'
}

function getWeekOffsetForDate(dateStr: string): number {
  const todayDate = new Date()
  const todayDay = todayDate.getDay()
  const currentMonday = new Date(todayDate)
  currentMonday.setDate(todayDate.getDate() + (todayDay === 0 ? -6 : 1 - todayDay))
  currentMonday.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const targetDay = target.getDay()
  const targetMonday = new Date(target)
  targetMonday.setDate(target.getDate() + (targetDay === 0 ? -6 : 1 - targetDay))
  targetMonday.setHours(0, 0, 0, 0)
  return Math.round((targetMonday.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

interface Roster {
  id: string
  name: string
}

interface Props {
  tasks: Task[]
  logs: TaskLog[]
  profile: User
  weekDates: string[]
  weekOffset?: number
  roster?: Roster[]
  store?: Pick<Store, 'latitude' | 'longitude' | 'geofence_radius_meters'> | null
}

function parseDayHeader(dateStr: string, today: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    isToday: dateStr === today,
    isFuture: dateStr > today,
    isPast: dateStr < today,
  }
}

export default function WeeklyGrid({ tasks: initialTasks, logs: initialLogs, profile, weekDates, weekOffset = 0, roster = [], store = null }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [logs, setLogs] = useState(initialLogs)
  const [toggling, setToggling] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [cameraTask, setCameraTask] = useState<Task | null>(null)
  const [notesTask, setNotesTask] = useState<Task | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskFormValue>(emptyTaskForm())
  const [savingTask, setSavingTask] = useState(false)

  const router = useRouter()
  const today = todayISO()
  const isCurrentWeek = weekOffset === 0
  const canAddTasks = profile.role === 'admin' || profile.can_add_tasks
  const isReadOnly = !isCurrentWeek

  // selectedDate drives the status cards; defaults to today or last day of past week
  const defaultDate = today <= (weekDates[6] ?? today) && today >= (weekDates[0] ?? today)
    ? today
    : (weekDates[6] ?? today)
  const [selectedDate, setSelectedDate] = useState(defaultDate)

  function handleDateChange(dateStr: string) {
    if (dateStr >= (weekDates[0] ?? '') && dateStr <= (weekDates[6] ?? '')) {
      setSelectedDate(dateStr)
    } else {
      const offset = getWeekOffsetForDate(dateStr)
      router.push(`/tasks?week=${offset}`)
    }
  }

  // Group tasks by category, sorted by scheduled_time within each group
  const grouped = useMemo(() => {
    const map = new Map<TaskCategory, Task[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat as TaskCategory, [])
    for (const t of tasks) {
      const arr = map.get(t.category) ?? []
      arr.push(t)
      map.set(t.category, arr)
    }
    for (const [cat, arr] of map) {
      arr.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
      map.set(cat, arr)
    }
    return [...map.entries()].filter(([, arr]) => arr.length > 0)
  }, [tasks])

  // On mount: report overdue tasks to create admin notifications (fire-and-forget)
  useEffect(() => {
    const overdue = tasks.filter(task => {
      const log = logs.find(l => l.task_id === task.id && l.log_date === today)
      return isTaskDueOn(task, today) && isOverdue(task.scheduled_time) && (!log || log.status === 'pending')
    })
    overdue.forEach(task => {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          log_date: today,
          message: `"${task.title}" was due at ${formatTime(task.scheduled_time)} and has not been completed.`,
        }),
      }).catch(() => {})
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getLog(taskId: string, dateStr: string): TaskLog | undefined {
    return logs.find(l => l.task_id === taskId && l.log_date === dateStr)
  }

  async function handleToggle(task: Task, dateStr: string) {
    if (dateStr !== today || isReadOnly) return
    const key = `${task.id}-${dateStr}`
    if (toggling === key) return

    setToggling(key)
    setError(null)
    const supabase = createClient()
    const existing = getLog(task.id, dateStr)

    if (existing) {
      const newStatus = existing.status === 'done' ? 'pending' : 'done'
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ status: newStatus })
        .eq('id', existing.id)
        .select()
        .single()
      if (err) { setError(err.message); setToggling(null); return }
      setLogs(prev => prev.map(l => l.id === existing.id ? data as TaskLog : l))
    } else {
      const { data, error: err } = await supabase
        .from('task_logs')
        .insert({
          task_id: task.id,
          log_date: dateStr,
          status: 'done',
          completed_by: profile.id,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (err) { setError(err.message); setToggling(null); return }
      setLogs(prev => [...prev, data as TaskLog])
    }
    setToggling(null)
  }

  function patchTaskForm(patch: Partial<TaskFormValue>) {
    setTaskForm(f => ({ ...f, ...patch }))
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    setSavingTask(true)
    setError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        category: taskForm.category,
        scheduled_time: taskForm.scheduled_time,
        frequency: 'daily',
        active: taskForm.active,
        recurrence_unit: taskForm.recurrence_unit,
        recurrence_interval: taskForm.recurrence_interval,
        recurrence_weekdays: taskForm.recurrence_weekdays.length > 0 ? taskForm.recurrence_weekdays : null,
        recurrence_anchor_date: taskForm.recurrence_anchor_date,
        assigned_user_id: taskForm.assigned_user_id,
        require_photo: taskForm.require_photo,
        require_notes: taskForm.require_notes,
      })
      .select()
      .single()
    if (err) { setError(err.message); setSavingTask(false); return }
    setTasks(prev => [...prev, data as Task])
    setSavingTask(false)
    setShowTaskForm(false)
    setTaskForm(emptyTaskForm())
  }

  function assigneeName(userId: string | null) {
    if (!userId) return null
    return roster.find(u => u.id === userId)?.name ?? null
  }

  async function handleSaveNotes(task: Task, text: string) {
    setSavingNotes(true)
    setError(null)
    const supabase = createClient()
    const existing = getLog(task.id, today)
    const trimmed = text.trim()

    if (existing) {
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ notes: trimmed || null })
        .eq('id', existing.id)
        .select()
        .single()
      if (err) { setError(err.message); setSavingNotes(false); return }
      setLogs(prev => prev.map(l => l.id === existing.id ? data as TaskLog : l))
    } else {
      const { data, error: err } = await supabase
        .from('task_logs')
        .insert({ task_id: task.id, log_date: today, status: 'pending', notes: trimmed || null })
        .select()
        .single()
      if (err) { setError(err.message); setSavingNotes(false); return }
      setLogs(prev => [...prev, data as TaskLog])
    }

    setSavingNotes(false)
    setNotesTask(null)
  }

  async function handlePhotoUpload(task: Task, file: File) {
    const key = task.id
    setUploading(key)
    setError(null)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `${profile.id}/${today}/${task.id}.${ext}`

    // Geofencing is opt-in per store — only ask for location if the store
    // actually has a center + radius configured, so staff at stores that
    // haven't enabled this never see a location permission prompt.
    const geofenceEnabled = store?.latitude != null && store?.longitude != null && store?.geofence_radius_meters != null
    const [{ error: uploadErr }, position] = await Promise.all([
      supabase.storage.from('task-photos').upload(path, file, { upsert: true }),
      geofenceEnabled ? getCurrentPosition() : Promise.resolve(null),
    ])

    if (uploadErr) { setError('Upload failed: ' + uploadErr.message); setUploading(null); return }

    const { data: signedData } = await supabase.storage
      .from('task-photos')
      .createSignedUrl(path, 60 * 60 * 24 * 365)

    const photoUrl = signedData?.signedUrl ?? path
    const existing = getLog(task.id, today)

    const geoFields = position
      ? {
          photo_lat: position.lat,
          photo_lng: position.lng,
          photo_outside_geofence: geofenceEnabled
            ? distanceMeters(position.lat, position.lng, store!.latitude!, store!.longitude!) > store!.geofence_radius_meters!
            : false,
        }
      : {}

    if (existing) {
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ photo_url: photoUrl, ...geoFields })
        .eq('id', existing.id)
        .select()
        .single()
      if (err) { setError(err.message); setUploading(null); return }
      setLogs(prev => prev.map(l => l.id === existing.id ? data as TaskLog : l))
    } else {
      const { data, error: err } = await supabase
        .from('task_logs')
        .insert({
          task_id: task.id,
          log_date: today,
          status: 'done',
          completed_by: profile.id,
          completed_at: new Date().toISOString(),
          photo_url: photoUrl,
          ...geoFields,
        })
        .select()
        .single()
      if (err) { setError(err.message); setUploading(null); return }
      setLogs(prev => [...prev, data as TaskLog])
    }

    setUploading(null)
  }

  // Tasks due on the selected date (recurrence-aware)
  const dueSelectedTasks = useMemo(() => tasks.filter(t => isTaskDueOn(t, selectedDate)), [tasks, selectedDate])
  const dueTodayTasks = useMemo(() => tasks.filter(t => isTaskDueOn(t, today)), [tasks, today])

  // Status counters driven by selectedDate
  const selectedStatuses = useMemo(() =>
    dueSelectedTasks.map(t => computeDateStatus(t, getLog(t.id, selectedDate), selectedDate, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dueSelectedTasks, logs, selectedDate, today]
  )
  const doneCount     = selectedStatuses.filter(s => s === 'done').length
  const upcomingCount = selectedStatuses.filter(s => s === 'upcoming').length
  const pendingCount  = selectedStatuses.filter(s => s === 'pending').length
  const missedCount   = selectedStatuses.filter(s => s === 'missed').length
  // Progress bar always reflects today
  const doneTodayCount = dueTodayTasks.filter(t => getLog(t.id, today)?.status === 'done').length
  const pct = dueTodayTasks.length > 0 ? Math.round((doneTodayCount / dueTodayTasks.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-onSurface">Weekly Tasks</h1>
          <p className="text-xs text-onSurfaceVariant/70 mt-0.5">{weekDates[0]} – {weekDates[6]}</p>
        </div>
        {canAddTasks && isCurrentWeek && (
          <button onClick={() => setShowTaskForm(true)} className="btn-primary text-sm">
            + Add Task
          </button>
        )}
      </div>

      {/* Status counters — card base, status color reserved for the count itself */}
      {tasks.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card">
              <p className="text-xs font-medium text-onSurfaceVariant">Total Tasks</p>
              <p className="text-2xl font-bold mt-1 text-onSurface">{dueSelectedTasks.length}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-onSurfaceVariant">Upcoming</p>
              <p className="text-2xl font-bold mt-1 text-onSurfaceVariant">{upcomingCount}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-onSurfaceVariant">Completed</p>
              <p className="text-2xl font-bold mt-1 text-success">{doneCount}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-onSurfaceVariant">Pending</p>
              <p className="text-2xl font-bold mt-1 text-warning">{pendingCount}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-onSurfaceVariant">Missed</p>
              <p className="text-2xl font-bold mt-1 text-error">{missedCount}</p>
            </div>
          </div>

          {/* Date picker — same style as admin dashboard */}
          <div className="card py-3 px-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div className="w-36">
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={selectedDate}
                  max={today}
                  onChange={e => { if (e.target.value) handleDateChange(e.target.value) }}
                />
              </div>
              {selectedDate !== today && (
                <button
                  onClick={() => handleDateChange(today)}
                  className="btn-ghost text-xs pb-2"
                >
                  Back to today
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Progress bar — today only */}
      {tasks.length > 0 && isCurrentWeek && (
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-onSurfaceVariant">Today&apos;s progress</span>
            <span className="text-xs font-bold text-primary">{doneTodayCount}/{tasks.length}</span>
          </div>
          <div className="h-2 rounded-full bg-surfaceContainerHigh overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {cameraTask && (
        <CameraCapture
          onCapture={file => { handlePhotoUpload(cameraTask, file); setCameraTask(null) }}
          onClose={() => setCameraTask(null)}
        />
      )}

      {/* Add Task Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-onSurface/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="modal-surface w-full max-w-lg p-5 sm:p-6 my-8">
            <h2 className="text-lg font-bold mb-4 text-onSurface">New Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <TaskFormFields value={taskForm} onChange={patchTaskForm} roster={roster} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTaskForm(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={savingTask} className="btn-primary flex-1">
                  {savingTask ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-onSurface/40 backdrop-blur-sm p-4">
          <div className="modal-surface w-full max-w-md p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-1 text-onSurface">Notes</h2>
            <p className="text-xs text-onSurfaceVariant/70 mb-4">{notesTask.title}</p>
            <textarea
              className="input resize-none" rows={4}
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder="Add a note…"
              autoFocus
            />
            <div className="flex gap-3 pt-3">
              <button type="button" onClick={() => setNotesTask(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                type="button"
                disabled={savingNotes}
                onClick={() => handleSaveNotes(notesTask, notesDraft)}
                className="btn-primary flex-1"
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {/* Task column header */}
              <th className="sticky left-0 z-10 bg-surfaceContainerLowest px-4 py-3 text-left border-b border-outlineVariant w-52 min-w-[180px]">
                <span className="text-xs font-semibold text-onSurfaceVariant/70 uppercase tracking-wider">Task</span>
              </th>
              {weekDates.map(dateStr => {
                const { dayName, dayDate, isToday } = parseDayHeader(dateStr, today)
                return (
                  <th key={dateStr} className={cn(
                    'py-3 px-2 text-center border-b border-outlineVariant min-w-[80px]',
                    isToday && 'bg-primaryContainer/40'
                  )}>
                    <div className={cn('text-xs font-semibold uppercase tracking-wide', isToday ? 'text-primary' : 'text-onSurfaceVariant/70')}>
                      {dayName}
                    </div>
                    <div className={cn('text-sm font-bold leading-tight', isToday ? 'text-onPrimaryContainer' : 'text-onSurface')}>
                      {dayDate}
                    </div>
                    {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-1" />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap(([category, catTasks]) => [
              // Category header row
              <tr key={`cat-${category}`}>
                <td
                  colSpan={8}
                  className="sticky left-0 bg-surfaceContainer/80 px-4 py-2 border-b border-t border-outlineVariant"
                >
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">
                    {category}
                  </span>
                </td>
              </tr>,

              // Task rows
              ...catTasks.map(task => (
                <tr key={task.id} className="group hover:bg-surfaceContainer/40 transition-colors">
                  {/* Task name + trigger time */}
                  <td className="sticky left-0 z-10 bg-surfaceContainerLowest group-hover:bg-surfaceContainer/40 px-4 py-3 border-b border-outlineVariant transition-colors">
                    <div className="font-medium text-onSurface leading-snug">{task.title}</div>
                    <div className="text-xs text-onSurfaceVariant/70 mt-0.5 font-mono">
                      {formatTime(task.scheduled_time)}
                    </div>
                    {assigneeName(task.assigned_user_id) && (
                      <div className="text-xs text-primary mt-1">
                        → {assigneeName(task.assigned_user_id)}
                      </div>
                    )}
                  </td>

                  {/* Date cells */}
                  {weekDates.map(dateStr => {
                    const { isToday: cellIsToday, isFuture, isPast } = parseDayHeader(dateStr, today)
                    const dueOnDate = isTaskDueOn(task, dateStr)
                    const log = getLog(task.id, dateStr)
                    const isDone = log?.status === 'done'
                    const isMissed = log?.status === 'missed'
                    const isPending = !log || log.status === 'pending'
                    const overdue = cellIsToday && isPending && isOverdue(task.scheduled_time)
                    const isLoading = toggling === `${task.id}-${dateStr}`
                    const isUploadingThis = uploading === task.id
                    const canClick = cellIsToday && dueOnDate && !isMissed && !isReadOnly
                    const canUpload = cellIsToday && dueOnDate && !isReadOnly && !isMissed

                    if (!dueOnDate && !log) {
                      return (
                        <td
                          key={dateStr}
                          className={cn('py-2 px-2 text-center border-b border-outlineVariant', cellIsToday && 'bg-primaryContainer/20')}
                        >
                          <div className="py-1.5">
                            <span className="text-outlineVariant select-none" title="Not scheduled this day">—</span>
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          'py-2 px-2 text-center border-b border-outlineVariant transition-colors',
                          cellIsToday && 'bg-primaryContainer/20',
                        )}
                      >
                        <div className="flex flex-col items-center">
                          {/* Checkbox / status indicator */}
                          <div className="py-1.5">
                            {isFuture ? (
                              <span className="text-outlineVariant select-none">—</span>
                            ) : isDone ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-success">
                                <svg className="w-3.5 h-3.5 text-onSuccess" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                            ) : isMissed ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-errorContainer border-2 border-error/40">
                                <span className="text-onErrorContainer text-xs font-bold">✕</span>
                              </span>
                            ) : isPast ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-outlineVariant bg-surfaceContainerLow">
                                <span className="text-onSurfaceVariant/40 text-xs">—</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleToggle(task, dateStr)}
                                disabled={!canClick || isLoading}
                                aria-label={`Mark "${task.title}" done`}
                                className={cn(
                                  'inline-flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all',
                                  canClick && 'hover:border-primary/60 hover:bg-primary/8',
                                  !canClick && 'cursor-default',
                                  overdue
                                    ? 'border-error bg-errorContainer ring-2 ring-error/40 ring-offset-1 animate-pulse'
                                    : 'border-outline bg-surface',
                                  isLoading && 'opacity-40',
                                )}
                              />
                            )}
                          </div>

                          {/* Divider + photo/notes (today only) */}
                          {cellIsToday && !isFuture && (canUpload || !!log?.photo_url || !!log?.notes) && (
                            <>
                              <div className="w-full border-t border-outlineVariant" />
                              <div className="py-1.5 flex items-center justify-center gap-2">
                                {canUpload && (
                                  <button
                                    type="button"
                                    title={log?.notes ? 'Edit note' : 'Add note'}
                                    onClick={() => { setNotesTask(task); setNotesDraft(log?.notes ?? '') }}
                                    className={cn(
                                      'transition-colors',
                                      log?.notes ? 'text-tertiary' : 'text-onSurfaceVariant hover:text-primary'
                                    )}
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                )}
                                {log?.photo_url ? (
                                  <span title="Photo attached" className="text-success">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    title="Take photo"
                                    onClick={() => setCameraTask(task)}
                                    disabled={isUploadingThis}
                                    className={cn(
                                      'cursor-pointer text-onSurfaceVariant hover:text-primary transition-colors',
                                      isUploadingThis && 'opacity-40 pointer-events-none'
                                    )}
                                  >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>

        {tasks.length === 0 && (
          <div className="text-center py-16 text-onSurfaceVariant/70">
            <p className="text-4xl mb-2">☕</p>
            <p className="font-medium">No tasks yet</p>
            {canAddTasks && <p className="text-sm mt-1">Click &ldquo;Add Task&rdquo; to create the first one</p>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-onSurfaceVariant/70 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-success">
            <svg className="w-2.5 h-2.5 text-onSuccess" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </span>
          Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-errorContainer border-2 border-error/40">
            <span className="text-onErrorContainer text-[8px] font-bold">✕</span>
          </span>
          Missed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex w-4 h-4 rounded-full border-2 border-error bg-errorContainer ring-1 ring-error/30" />
          Overdue (30+ min)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex w-4 h-4 rounded-full border-2 border-outline bg-surface" />
          Pending
        </span>
      </div>
    </div>
  )
}
