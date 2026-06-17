'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatTime, isOverdue, CATEGORY_ORDER, todayISO } from '@/lib/utils'
import type { Task, TaskLog, TaskCategory, User } from '@/types/database'

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

const CATEGORIES: TaskCategory[] = ['Opening', 'Setup', 'Prep', 'Cleaning', 'Closing', 'Other']

const EMPTY_TASK_FORM = {
  title: '',
  description: '',
  category: 'Opening' as TaskCategory,
  scheduled_time: '08:00',
}

interface Props {
  tasks: Task[]
  logs: TaskLog[]
  profile: User
  weekDates: string[]
  weekOffset?: number
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

export default function WeeklyGrid({ tasks: initialTasks, logs: initialLogs, profile, weekDates, weekOffset = 0 }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [logs, setLogs] = useState(initialLogs)
  const [toggling, setToggling] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM)
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
      return isOverdue(task.scheduled_time) && (!log || log.status === 'pending')
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
        active: true,
      })
      .select()
      .single()
    if (err) { setError(err.message); setSavingTask(false); return }
    setTasks(prev => [...prev, data as Task])
    setSavingTask(false)
    setShowTaskForm(false)
    setTaskForm(EMPTY_TASK_FORM)
  }

  async function handlePhotoUpload(task: Task, file: File) {
    const key = task.id
    setUploading(key)
    setError(null)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `${profile.id}/${today}/${task.id}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('task-photos')
      .upload(path, file, { upsert: true })

    if (uploadErr) { setError('Upload failed: ' + uploadErr.message); setUploading(null); return }

    const { data: signedData } = await supabase.storage
      .from('task-photos')
      .createSignedUrl(path, 60 * 60 * 24 * 365)

    const photoUrl = signedData?.signedUrl ?? path
    const existing = getLog(task.id, today)

    if (existing) {
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ photo_url: photoUrl })
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
        })
        .select()
        .single()
      if (err) { setError(err.message); setUploading(null); return }
      setLogs(prev => [...prev, data as TaskLog])
    }

    setUploading(null)
  }

  // Status counters driven by selectedDate
  const selectedStatuses = useMemo(() =>
    tasks.map(t => computeDateStatus(t, getLog(t.id, selectedDate), selectedDate, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, logs, selectedDate, today]
  )
  const doneCount     = selectedStatuses.filter(s => s === 'done').length
  const upcomingCount = selectedStatuses.filter(s => s === 'upcoming').length
  const pendingCount  = selectedStatuses.filter(s => s === 'pending').length
  const missedCount   = selectedStatuses.filter(s => s === 'missed').length
  // Progress bar always reflects today
  const doneTodayCount = tasks.filter(t => getLog(t.id, today)?.status === 'done').length
  const pct = tasks.length > 0 ? Math.round((doneTodayCount / tasks.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-900">Weekly Tasks</h1>
          <p className="text-xs text-gray-400 mt-0.5">{weekDates[0]} – {weekDates[6]}</p>
        </div>
        {canAddTasks && isCurrentWeek && (
          <button onClick={() => setShowTaskForm(true)} className="btn-primary text-sm">
            + Add Task
          </button>
        )}
      </div>

      {/* Status counters */}
      {tasks.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-2xl p-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-500">Total Tasks</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{tasks.length}</p>
            </div>
            <div className="rounded-2xl p-4 bg-gray-100">
              <p className="text-xs font-medium text-gray-500">Upcoming</p>
              <p className="text-2xl font-bold mt-1 text-gray-600">{upcomingCount}</p>
            </div>
            <div className="rounded-2xl p-4 bg-green-50">
              <p className="text-xs font-medium text-green-600">Completed</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{doneCount}</p>
            </div>
            <div className="rounded-2xl p-4 bg-yellow-50">
              <p className="text-xs font-medium text-yellow-600">Pending</p>
              <p className="text-2xl font-bold mt-1 text-yellow-600">{pendingCount}</p>
            </div>
            <div className="rounded-2xl p-4 bg-red-50">
              <p className="text-xs font-medium text-red-600">Missed</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{missedCount}</p>
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
                  className="btn-ghost text-xs text-brand-600 pb-2"
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
            <span className="text-xs font-medium text-gray-600">Today&apos;s progress</span>
            <span className="text-xs font-bold text-brand-600">{doneTodayCount}/{tasks.length}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="card w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-4">New Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  className="input" required
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input resize-none" rows={2}
                  value={taskForm.description}
                  onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category *</label>
                  <select
                    className="input"
                    value={taskForm.category}
                    onChange={e => setTaskForm(f => ({ ...f, category: e.target.value as TaskCategory }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Scheduled time *</label>
                  <input
                    type="time" className="input" required
                    value={taskForm.scheduled_time}
                    onChange={e => setTaskForm(f => ({ ...f, scheduled_time: e.target.value }))}
                  />
                </div>
              </div>
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

      {/* Weekly grid */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {/* Task column header */}
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left border-b border-gray-100 w-52 min-w-[180px]">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Task</span>
              </th>
              {weekDates.map(dateStr => {
                const { dayName, dayDate, isToday } = parseDayHeader(dateStr, today)
                return (
                  <th key={dateStr} className={cn(
                    'py-3 px-2 text-center border-b border-gray-100 min-w-[80px]',
                    isToday && 'bg-brand-50'
                  )}>
                    <div className={cn('text-xs font-semibold uppercase tracking-wide', isToday ? 'text-brand-600' : 'text-gray-400')}>
                      {dayName}
                    </div>
                    <div className={cn('text-sm font-bold leading-tight', isToday ? 'text-brand-700' : 'text-gray-700')}>
                      {dayDate}
                    </div>
                    {isToday && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mx-auto mt-1" />}
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
                  className="sticky left-0 bg-gray-50/80 px-4 py-2 border-b border-t border-gray-100"
                >
                  <span className="text-xs font-bold uppercase tracking-widest text-brand-500">
                    {category}
                  </span>
                </td>
              </tr>,

              // Task rows
              ...catTasks.map(task => (
                <tr key={task.id} className="group hover:bg-gray-50/40 transition-colors">
                  {/* Task name + trigger time */}
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/40 px-4 py-3 border-b border-gray-50 transition-colors">
                    <div className="font-medium text-gray-900 leading-snug">{task.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 font-mono">
                      {formatTime(task.scheduled_time)}
                    </div>
                  </td>

                  {/* Date cells */}
                  {weekDates.map(dateStr => {
                    const { isToday: cellIsToday, isFuture, isPast } = parseDayHeader(dateStr, today)
                    const log = getLog(task.id, dateStr)
                    const isDone = log?.status === 'done'
                    const isMissed = log?.status === 'missed'
                    const isPending = !log || log.status === 'pending'
                    const overdue = cellIsToday && isPending && isOverdue(task.scheduled_time)
                    const isLoading = toggling === `${task.id}-${dateStr}`
                    const isUploadingThis = uploading === task.id
                    const canClick = cellIsToday && !isMissed && !isReadOnly
                    const canUpload = cellIsToday && !isReadOnly && !isMissed

                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          'py-2 px-2 text-center border-b border-gray-50 transition-colors',
                          cellIsToday && 'bg-brand-50/30',
                        )}
                      >
                        <div className="flex flex-col items-center">
                          {/* Checkbox / status indicator */}
                          <div className="py-1.5">
                            {isFuture ? (
                              <span className="text-gray-200 select-none">—</span>
                            ) : isDone ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                            ) : isMissed ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 border-2 border-red-300">
                                <span className="text-red-500 text-xs font-bold">✕</span>
                              </span>
                            ) : isPast ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-gray-200 bg-gray-50">
                                <span className="text-gray-300 text-xs">—</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleToggle(task, dateStr)}
                                disabled={!canClick || isLoading}
                                aria-label={`Mark "${task.title}" done`}
                                className={cn(
                                  'inline-flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all',
                                  canClick && 'hover:border-brand-400 hover:bg-brand-50',
                                  !canClick && 'cursor-default',
                                  overdue
                                    ? 'border-red-500 bg-red-50 ring-2 ring-red-300 ring-offset-1 animate-pulse'
                                    : 'border-gray-300 bg-white',
                                  isLoading && 'opacity-40',
                                )}
                              />
                            )}
                          </div>

                          {/* Divider + photo (today only) */}
                          {cellIsToday && !isFuture && (canUpload || !!log?.photo_url) && (
                            <>
                              <div className="w-full border-t border-gray-200" />
                              <div className="py-1.5">
                                {log?.photo_url ? (
                                  <span title="Photo attached" className="text-green-500">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                ) : (
                                  <label
                                    title="Upload photo"
                                    className={cn(
                                      'cursor-pointer text-gray-800 hover:text-brand-600 transition-colors',
                                      isUploadingThis && 'opacity-40 pointer-events-none'
                                    )}
                                  >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      className="sr-only"
                                      onChange={e => {
                                        const f = e.target.files?.[0]
                                        if (f) handlePhotoUpload(task, f)
                                        e.target.value = ''
                                      }}
                                    />
                                  </label>
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
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">☕</p>
            <p className="font-medium">No tasks yet</p>
            {canAddTasks && <p className="text-sm mt-1">Click &ldquo;Add Task&rdquo; to create the first one</p>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </span>
          Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 border-2 border-red-300">
            <span className="text-red-500 text-[8px] font-bold">✕</span>
          </span>
          Missed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex w-4 h-4 rounded-full border-2 border-red-500 bg-red-50 ring-1 ring-red-300" />
          Overdue (30+ min)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex w-4 h-4 rounded-full border-2 border-gray-300 bg-white" />
          Pending
        </span>
      </div>
    </div>
  )
}
