import { formatDateTime } from './utils'

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days} d ago` : formatDateTime(iso)
}

export function todayLabel(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
