import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from '@/features/sessions/model/facets'
import { matchCommands, paletteSessions } from './palette'

const hub = { id: 'hub', name: 'hub' } as Daemon
const e = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id,
    name: id,
    state: 'idle',
    needs_attention: false,
    source: 'launched',
    updated_at: '2026-11-16T00:00:00Z',
    ...over,
  } as Session,
})

it('offers, before anything is typed, the sessions opened here lately, then those waiting on the owner', () => {
  const list = [e('a'), e('b', { needs_attention: true }), e('c'), e('d', { archived_at: '2026-11-01T00:00:00Z' })]
  const shown = paletteSessions(list, '', ['hub/c', 'hub/d', 'hub/gone', 'hub/a'])
  expect(shown.map((x) => x.session.id)).toEqual(['c', 'a', 'b']) // archived and unknown ones left out
  expect(paletteSessions(list, 'b', []).map((x) => x.session.id)).toEqual(['b'])
})

it('matches commands by every word of their name, and offers none for a facet search', () => {
  const run = () => {}
  const commands = [
    { id: 'new', label: 'New session…', run },
    { id: 'here', label: 'New session here', run },
    { id: 'focus', label: 'Focus mode', run },
  ]
  expect(matchCommands(commands, '').map((c) => c.id)).toEqual(['new', 'here', 'focus'])
  expect(matchCommands(commands, 'new here').map((c) => c.id)).toEqual(['here'])
  expect(matchCommands(commands, 'FOC').map((c) => c.id)).toEqual(['focus'])
  expect(matchCommands(commands, 'role:pm')).toEqual([])
})
