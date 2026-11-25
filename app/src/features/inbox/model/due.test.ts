import { expect, it } from 'vitest'
import type { InboxItem } from '@/lib/api/types'
import { item } from '../test/hub'
import { dayFromToday, dueBody, dueLabel, splitDue } from './due'

// Noon on a Wednesday, local time.
const NOW = new Date(2026, 10, 25, 12, 0).getTime()
const at = (days: number, hour = 9) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const due = (days: number, state: InboxItem['due_state'], more: Partial<InboxItem> = {}) =>
  item(1, 'x', { due: at(days), due_state: state, ...more })

it('says a due date from the hub’s due_state: overdue, due today, then how soon, then the date', () => {
  expect(dueLabel(due(-3, 'overdue'), NOW)).toEqual({ text: 'overdue', tone: 'overdue' })
  expect(dueLabel(due(0, 'due'), NOW)).toEqual({ text: 'due today', tone: 'today' })
  expect(dueLabel(item(1, 'x', { due: at(0, 17), due_has_time: true, due_state: 'upcoming' }), NOW)).toEqual({
    text: 'due today · 5:00 PM',
    tone: 'today',
  })
  expect(dueLabel(due(1, 'upcoming'), NOW)?.text).toBe('tomorrow')
  expect(dueLabel(due(3, 'upcoming'), NOW)?.text).toBe('in 3 days')
  expect(dueLabel(due(30, 'upcoming'), NOW)?.text).toBe('Due Dec 25')
  expect(dueLabel(item(1, 'x'), NOW)).toBeNull()
  expect(dueLabel(due(-3, 'none', { status: 'done' }), NOW)).toBeNull() // done: the hub says none
})

it('"Due soon": due or overdue first, then the next 7 days, each by date; the rest keeps the owner’s order', () => {
  const items = [
    item(1, 'mine'),
    item(2, 'in 5 days', { due: at(5), due_state: 'upcoming' }),
    item(3, 'in 20 days', { due: at(20), due_state: 'upcoming' }),
    item(4, 'today', { due: at(0), due_state: 'due' }),
    item(5, 'in 2 days', { due: at(2), due_state: 'upcoming' }),
    item(6, 'last week', { due: at(-7), due_state: 'overdue' }),
  ]
  const { soon, rest } = splitDue(items, NOW)
  expect(soon.map((i) => i.text)).toEqual(['last week', 'today', 'in 2 days', 'in 5 days'])
  expect(rest.map((i) => i.text)).toEqual(['mine', 'in 20 days'])
})

it('sends a due date in the owner’s local time, a date alone without a time', () => {
  const day = dayFromToday(1, NOW)
  expect(dueBody(day, null)).toEqual({ due: '2026-11-26T00:00:00', due_has_time: false })
  expect(dueBody(day, '14:30')).toEqual({ due: '2026-11-26T14:30:00', due_has_time: true })
  expect(dayFromToday(30, NOW).getDate()).toBe(25) // Dec 25
})
