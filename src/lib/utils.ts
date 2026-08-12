import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(time: string): string {
  // "HH:MM" → "8:00 AM"
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(scheduledTime: string, graceMinutes = 30): boolean {
  const [h, m] = scheduledTime.split(':').map(Number)
  const now = new Date()
  const scheduled = new Date()
  scheduled.setHours(h, m + graceMinutes, 0, 0)
  return now > scheduled
}

export const CATEGORY_ORDER = ['Opening', 'Setup', 'Prep', 'Cleaning', 'Closing', 'Other'] as const
