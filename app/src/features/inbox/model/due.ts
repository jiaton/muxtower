import type { InboxItem, NewInboxItem } from '@/lib/api/types'

const DAY_MS = 86_400_000
/** How far ahead an upcoming item counts as due soon. */
export const SOON_DAYS = 7

const dayStart = (t: number | Date) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole days from today to `t`, by the calendar (0: today, 1: tomorrow, -1: yesterday). */
export const daysFrom = (t: number, now = Date.now()) => Math.round((dayStart(t).getTime() - dayStart(now).getTime()) / DAY_MS)

/** How a due date reads: `tone` says how pressing (an intent picks its look; never a raw colour). */
export interface DueLabel {
  text: string
  tone: 'overdue' | 'today' | 'later'
}

const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
export const dayName = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "overdue", "due today", "tomorrow", "in 3 days", "Due Dec 25" (a time after it, when one was set), from
 *  the hub's `due_state`; none for an item without a due date, or done. */
export function dueLabel(item: Pick<InboxItem, 'due' | 'due_has_time' | 'due_state'>, now = Date.now()): DueLabel | null {
  if (!item.due || item.due_state === 'none') return null
  const at = new Date(item.due)
  const time = item.due_has_time ? ` · ${clock(at)}` : ''
  if (item.due_state === 'overdue') return { text: 'overdue', tone: 'overdue' }
  if (item.due_state === 'due') return { text: `due today${time}`, tone: 'today' }
  const days = daysFrom(at.getTime(), now)
  if (days <= 0) return { text: `due today${time}`, tone: 'today' }
  if (days === 1) return { text: `tomorrow${time}`, tone: 'later' }
  if (days <= SOON_DAYS) return { text: `in ${days} days`, tone: 'later' }
  return { text: `Due ${dayName(at)}`, tone: 'later' }
}

/** Whether an item goes in "Due soon": due or overdue, or upcoming within `SOON_DAYS`. */
export function isDueSoon(item: InboxItem, now = Date.now()): boolean {
  if (!item.due || item.status === 'done') return false
  if (item.due_state === 'due' || item.due_state === 'overdue') return true
  return item.due_state === 'upcoming' && daysFrom(Date.parse(item.due), now) <= SOON_DAYS
}

const rank = (item: InboxItem) => (item.due_state === 'overdue' || item.due_state === 'due' ? 0 : 1)

/** The open list split: "Due soon" (due or overdue first, then upcoming, each by when) and the rest, in the
 *  owner's order. */
export function splitDue(items: readonly InboxItem[], now = Date.now()): { soon: InboxItem[]; rest: InboxItem[] } {
  const soon = items.filter((i) => isDueSoon(i, now)).sort((a, b) => rank(a) - rank(b) || Date.parse(a.due!) - Date.parse(b.due!))
  return { soon, rest: items.filter((i) => !soon.includes(i)) }
}

/** The quick choices, as days from today. */
export const QUICK_DUE = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
  { label: 'In 30 days', days: 30 },
] as const

/** A day `days` from today (midnight, local). */
export function dayFromToday(days: number, now = Date.now()): Date {
  const d = dayStart(now)
  d.setDate(d.getDate() + days)
  return d
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** A due date as the hub takes it: the owner's local time without an offset; a date alone has no time (the
 *  hub puts it at its due hour). `time` is "HH:MM". */
export function dueBody(day: Date, time: string | null): Pick<NewInboxItem, 'due' | 'due_has_time'> {
  return time ? { due: `${isoDay(day)}T${time}:00`, due_has_time: true } : { due: `${isoDay(day)}T00:00:00`, due_has_time: false }
}

/** A due date as the picker shows it again: its day and, when one was set, its time ("HH:MM"). */
export function dueParts(item: Pick<InboxItem, 'due' | 'due_has_time'>): { day: Date; time: string | null } | null {
  if (!item.due) return null
  const at = new Date(item.due)
  return { day: dayStart(at), time: item.due_has_time ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : null }
}
