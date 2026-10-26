import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { KEPT_GROUP, keptEntries, keptGroups } from './kept'
import { filterEntries } from './query'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: { id, name: id, state: 'idle', needs_attention: false, updated_at: '2026-10-25T10:00:00Z', ...over } as Session,
})

describe('kept', () => {
  const unread = { view: 'unread', group: 'status' } as const

  it('keeps what was opened here and has left the list, in the order it was opened', () => {
    const entries = [entry('a'), entry('b', { unread: true }), entry('c'), entry('d')]
    const visible = filterEntries(entries, unread)
    const kept = keptEntries(entries, visible, ['d1/c', 'd1/b', 'd1/a'], unread)
    expect(kept.map((e) => e.session.id)).toEqual(['c', 'a']) // b is unread again: back in its place
    expect(keptGroups(kept)).toEqual([{ key: KEPT_GROUP, label: 'Just opened', entries: kept, implies: {} }])
    expect(keptGroups([])).toEqual([])
  })

  it('lets hiding take a session out, and forgets sessions that are gone', () => {
    const entries = [entry('a', { hidden: true }), entry('b')]
    expect(keptEntries(entries, [], ['d1/a', 'd1/b', 'd1/gone'], unread).map((e) => e.session.id)).toEqual(['b'])
    expect(keptEntries(entries, [], ['d1/a', 'd1/b'], { view: 'hidden', group: 'status' }).map((e) => e.session.id)).toEqual(['a'])
  })
})
