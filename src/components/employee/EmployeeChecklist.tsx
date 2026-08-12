'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatTime, isOverdue, CATEGORY_ORDER } from '@/lib/utils'
import type { TaskWithLog, TaskLog, TaskCategory } from '@/types/database'
import PhotoUpload from './PhotoUpload'

interface Props {
  initialTasks: TaskWithLog[]
  userId: string
  today: string
}

export default function EmployeeChecklist({ initialTasks, userId, today }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<TaskCategory, TaskWithLog[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat as TaskCategory, [])
    for (const t of tasks) {
      const arr = map.get(t.category) ?? []
      arr.push(t)
      map.set(t.category, arr)
    }
    // Remove empty categories
    return [...map.entries()].filter(([, arr]) => arr.length > 0)
  }, [tasks])

  const doneCount = tasks.filter(t => t.task_logs[0]?.status === 'done').length
  const totalCount = tasks.length
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  async function handleToggle(task: TaskWithLog) {
    const supabase = createClient()
    const existingLog = task.task_logs[0]
    const isDone = existingLog?.status === 'done'

    setError(null)

    if (existingLog) {
      // Toggle status
      const newStatus = isDone ? 'pending' : 'done'
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ status: newStatus })
        .eq('id', existingLog.id)
        .select()
        .single()

      if (err) { setError(err.message); return }
      updateTaskLog(task.id, data as TaskLog)
    } else {
      // Create new log
      const { data, error: err } = await supabase
        .from('task_logs')
        .insert({
          task_id: task.id,
          log_date: today,
          status: 'done',
          completed_by: userId,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (err) { setError(err.message); return }
      updateTaskLog(task.id, data as TaskLog)
    }
  }

  async function handlePhotoUpload(task: TaskWithLog, file: File) {
    const supabase = createClient()
    setUploading(task.id)
    setError(null)

    const ext = file.name.split('.').pop()
    const path = `${userId}/${today}/${task.id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('task-photos')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError('Photo upload failed: ' + uploadError.message)
      setUploading(null)
      return
    }

    const { data: { signedUrl } } = await supabase.storage
      .from('task-photos')
      .createSignedUrl(path, 60 * 60 * 24 * 365)

    const photoUrl = signedUrl ?? path

    const existingLog = task.task_logs[0]
    if (existingLog) {
      const { data, error: err } = await supabase
        .from('task_logs')
        .update({ photo_url: photoUrl })
        .eq('id', existingLog.id)
        .select()
        .single()
      if (err) { setError(err.message); setUploading(null); return }
      updateTaskLog(task.id, data as TaskLog)
    } else {
      const { data, error: err } = await supabase
        .from('task_logs')
        .insert({
          task_id: task.id,
          log_date: today,
          status: 'done',
          completed_by: userId,
          completed_at: new Date().toISOString(),
          photo_url: photoUrl,
        })
        .select()
        .single()
      if (err) { setError(err.message); setUploading(null); return }
      updateTaskLog(task.id, data as TaskLog)
    }

    setUploading(null)
  }

  function updateTaskLog(taskId: string, log: TaskLog) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, task_logs: [log] } : t
    ))
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-onSurface">Today&apos;s progress</span>
          <span className="text-sm font-bold text-primary">{doneCount}/{totalCount}</span>
        </div>
        <div className="h-2.5 rounded-full bg-surfaceContainerHigh overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-onSurfaceVariant/70 mt-1.5">{pct}% complete</p>
      </div>

      {error && (
        <div className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {grouped.map(([category, catTasks]) => (
        <section key={category}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-3 px-1">
            {category}
          </h2>
          <div className="space-y-3">
            {catTasks.map(task => {
              const log = task.task_logs[0]
              const isDone = log?.status === 'done'
              const isMissed = log?.status === 'missed'
              const overdue = !isDone && isOverdue(task.scheduled_time)

              return (
                <div
                  key={task.id}
                  className={cn(
                    'card transition-all',
                    isDone && 'opacity-75',
                    isMissed && 'border border-error/30 bg-errorContainer/50',
                    overdue && !isDone && !isMissed && 'border border-warning/40 bg-warningContainer/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggle(task)}
                      disabled={isMissed}
                      aria-label={isDone ? 'Mark incomplete' : 'Mark done'}
                      className={cn(
                        'flex-shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        isDone
                          ? 'border-success bg-success text-onSuccess'
                          : isMissed
                          ? 'border-error/40 bg-errorContainer cursor-not-allowed'
                          : 'border-outline hover:border-primary/60'
                      )}
                    >
                      {isDone && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isMissed && <span className="text-onErrorContainer text-xs">✕</span>}
                    </button>

                    {/* Task info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'font-medium text-sm leading-snug',
                          isDone ? 'line-through text-onSurfaceVariant/60' : 'text-onSurface'
                        )}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isMissed && <span className="badge-missed">Missed</span>}
                          {overdue && !isDone && !isMissed && (
                            <span className="badge-pending">Overdue</span>
                          )}
                          <span className="text-xs text-onSurfaceVariant/70">{formatTime(task.scheduled_time)}</span>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-onSurfaceVariant mt-0.5">{task.description}</p>
                      )}

                      {/* Photo section */}
                      <div className="mt-2">
                        {log?.photo_url ? (
                          <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={log.photo_url}
                              alt="Task proof"
                              className="h-12 w-12 rounded-lg object-cover border border-outlineVariant"
                            />
                            <span className="text-xs text-success">📷 Photo attached</span>
                          </div>
                        ) : (
                          <PhotoUpload
                            taskId={task.id}
                            uploading={uploading === task.id}
                            onUpload={(file) => handlePhotoUpload(task, file)}
                          />
                        )}
                      </div>

                      {isDone && log?.completed_at && (
                        <p className="text-xs text-success mt-1">
                          ✓ Done at {new Date(log.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-onSurfaceVariant/70">
          <p className="text-4xl mb-2">✓</p>
          <p className="font-medium">No tasks for today</p>
        </div>
      )}
    </div>
  )
}
