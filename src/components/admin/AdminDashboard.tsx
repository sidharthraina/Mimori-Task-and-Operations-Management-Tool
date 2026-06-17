'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { cn, formatTime, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskLogWithTask } from '@/types/database'

type EffectiveStatus = 'upcoming' | 'pending' | 'missed' | 'done'

interface DashboardRow {
  task: Task
  log: TaskLogWithTask | undefined
  effectiveStatus: EffectiveStatus
}

interface Props {
  tasks: Task[]
  logs: TaskLogWithTask[]
  today: string
}

function computeStatus(
  task: Task,
  log: TaskLogWithTask | undefined,
  date: string,
  today: string,
  now: Date
): EffectiveStatus {
  if (log?.status === 'done') return 'done'
  if (!task.scheduled_time) return 'upcoming'

  const parts = task.scheduled_time.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const scheduled = new Date(date + 'T00:00:00')
  scheduled.setHours(h, m, 0, 0)
  const missedAt = new Date(scheduled.getTime() + 30 * 60 * 1000)

  if (date < today) return 'missed'
  if (date > today) return 'upcoming'

  // Today — time-based
  if (now < scheduled) return 'upcoming'
  if (now < missedAt) return 'pending'
  return 'missed'
}

const STATUS_FILTER_LABELS: Record<string, string> = {
  all:      'All statuses',
  upcoming: 'Upcoming',
  done:     'Completed',
  pending:  'Pending',
  missed:   'Missed',
}

export default function AdminDashboard({ tasks, logs: initialLogs, today }: Props) {
  const [filterDate, setFilterDate] = useState(today)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [logs, setLogs] = useState<TaskLogWithTask[]>(initialLogs)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // Realtime subscription: keep logs in sync as staff mark tasks done
  useEffect(() => {
    const supabase = createClient()

    channelRef.current = supabase
      .channel('admin-task-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_logs' },
        async () => {
          // Re-fetch the full log list (with joined users + tasks) when anything changes
          const since = new Date()
          since.setDate(since.getDate() - 6)
          const sinceISO = since.toISOString().slice(0, 10)

          const { data } = await supabase
            .from('task_logs')
            .select('*, tasks(*), users:completed_by(id, name, email)')
            .gte('log_date', sinceISO)
            .order('log_date', { ascending: false })

          if (data) setLogs(data as TaskLogWithTask[])
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  // Build all rows for the selected date (every active task, with or without a log)
  const allRows = useMemo<DashboardRow[]>(() => {
    const now = new Date()
    return tasks.map(task => {
      const log = logs.find(
        l => l.task_id === task.id && l.log_date === filterDate
      ) as TaskLogWithTask | undefined
      return {
        task,
        log,
        effectiveStatus: computeStatus(task, log, filterDate, today, now),
      }
    }).sort((a, b) => a.task.scheduled_time.localeCompare(b.task.scheduled_time))
  }, [tasks, logs, filterDate, today])

  const filtered = useMemo(() =>
    filterStatus === 'all'
      ? allRows
      : allRows.filter(r => r.effectiveStatus === filterStatus),
    [allRows, filterStatus]
  )

  const upcomingCount = allRows.filter(r => r.effectiveStatus === 'upcoming').length
  const pendingCount  = allRows.filter(r => r.effectiveStatus === 'pending').length
  const missedCount   = allRows.filter(r => r.effectiveStatus === 'missed').length
  const doneCount     = allRows.filter(r => r.effectiveStatus === 'done').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-dark-900">Dashboard</h1>
        <span className="text-sm text-gray-500">{formatDate(filterDate)}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Total Tasks" value={String(allRows.length)}  color="neutral" />
        <SummaryCard label="Upcoming"    value={String(upcomingCount)}   color="gray" />
        <SummaryCard label="Completed"   value={String(doneCount)}       color="green" />
        <SummaryCard label="Pending"     value={String(pendingCount)}    color="yellow" />
        <SummaryCard label="Missed"      value={String(missedCount)}     color="red" />
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex gap-3 flex-wrap">
          <div className="w-36">
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setFilterStatus('all') }}
              max={today}
            />
          </div>
          <div className="w-36">
            <label className="label">Status</label>
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              {Object.entries(STATUS_FILTER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed by</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed at</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No tasks match the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map(({ task, log, effectiveStatus }) => (
                <tr
                  key={task.id}
                  className={cn(
                    'transition-colors hover:bg-gray-50/50',
                    effectiveStatus === 'missed'   && 'bg-red-50/40',
                    effectiveStatus === 'pending'  && 'bg-yellow-50/40',
                    effectiveStatus === 'upcoming' && 'bg-blue-50/30',
                  )}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                    {task.title}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                    {formatTime(task.scheduled_time)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={effectiveStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {(log?.users as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {log?.completed_at
                      ? new Date(log.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {log?.photo_url ? (
                      <button
                        onClick={() => setPhotoUrl(log?.photo_url ?? null)}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-right">
        Showing {filtered.length} of {allRows.length} tasks
      </p>

      {/* Photo popup */}
      {photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPhotoUrl(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPhotoUrl(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Task proof"
              className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: {
  label: string; value: string; color: 'neutral' | 'gray' | 'green' | 'yellow' | 'red'
}) {
  const colors = {
    neutral: 'text-gray-900 bg-gray-50',
    gray:    'text-gray-600 bg-gray-100',
    green:   'text-green-600 bg-green-50',
    yellow:  'text-yellow-600 bg-yellow-50',
    red:     'text-red-600 bg-red-50',
  }
  return (
    <div className={cn('rounded-2xl p-4', colors[color])}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: EffectiveStatus }) {
  if (status === 'done')    return <span className="badge-done">Completed</span>
  if (status === 'missed')  return <span className="badge-missed">Missed</span>
  if (status === 'pending') return <span className="badge-pending">Pending</span>
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
      Upcoming
    </span>
  )
}
