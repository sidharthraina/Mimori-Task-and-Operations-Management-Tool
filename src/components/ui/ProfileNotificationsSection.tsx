'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface FeedItem {
  key: string
  id: string
  source: 'missed' | 'escalation'
  message: string
  created_at: string
}

interface Props {
  isAdmin: boolean
  isManager: boolean
  onCountChange: (count: number) => void
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProfileNotificationsSection({ isAdmin, isManager, onCountChange }: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const requests: Promise<FeedItem[]>[] = []

      if (isAdmin) {
        requests.push(
          fetch('/api/notifications').then(r => r.json()).then(json =>
            (json.notifications ?? []).map((n: { id: string; message: string; created_at: string }) => ({
              key: `missed-${n.id}`, id: n.id, source: 'missed' as const, message: n.message, created_at: n.created_at,
            }))
          )
        )
      }
      if (isAdmin || isManager) {
        requests.push(
          fetch('/api/escalation-notifications').then(r => r.json()).then(json =>
            (json.notifications ?? []).map((n: { id: string; message: string; created_at: string }) => ({
              key: `escalation-${n.id}`, id: n.id, source: 'escalation' as const, message: n.message, created_at: n.created_at,
            }))
          )
        )
      }

      const results = await Promise.all(requests)
      if (cancelled) return
      const merged = results.flat().sort((a, b) => b.created_at.localeCompare(a.created_at))
      setItems(merged)
      onCountChange(merged.length)
    }

    load().catch(() => { if (!cancelled) setError('Could not load notifications.') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isManager])

  async function markRead(item: FeedItem) {
    setBusyKey(item.key)
    const endpoint = item.source === 'missed' ? '/api/notifications' : '/api/escalation-notifications'
    await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
    setItems(prev => {
      const next = (prev ?? []).filter(i => i.key !== item.key)
      onCountChange(next.length)
      return next
    })
    setBusyKey(null)
  }

  async function markAllRead() {
    setBusyKey('all')
    const calls: Promise<Response>[] = []
    if (isAdmin) calls.push(fetch('/api/notifications', { method: 'PATCH' }))
    if (isAdmin || isManager) calls.push(fetch('/api/escalation-notifications', { method: 'PATCH' }))
    await Promise.all(calls)
    setItems([])
    onCountChange(0)
    setBusyKey(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="label">Notifications</p>
        {items && items.length > 0 && (
          <button onClick={markAllRead} disabled={busyKey === 'all'} className="btn-ghost text-xs">
            {busyKey === 'all' ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-3 py-2">{error}</p>}

      {items === null && <p className="text-sm text-onSurfaceVariant/70 py-6 text-center">Loading…</p>}

      {items && items.length === 0 && !error && (
        <p className="text-sm text-onSurfaceVariant/70 py-6 text-center">No unread notifications.</p>
      )}

      {items && items.length > 0 && (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {items.map(item => (
            <button
              key={item.key}
              onClick={() => markRead(item)}
              disabled={busyKey === item.key}
              className={cn(
                'w-full text-left rounded-xl px-3 py-2.5 border transition-colors',
                item.source === 'missed' ? 'bg-errorContainer/60 border-error/20 hover:bg-errorContainer' : 'bg-warningContainer/60 border-warning/20 hover:bg-warningContainer',
                busyKey === item.key && 'opacity-50'
              )}
            >
              <p className="text-sm text-onSurface leading-snug">{item.message}</p>
              <p className="text-xs text-onSurfaceVariant/70 mt-1">{timeAgo(item.created_at)} · tap to dismiss</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
