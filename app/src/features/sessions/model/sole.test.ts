import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { soleSession, toggleable } from './query'
import { toQuery } from './search'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon

function entry(id: string, over: Partial<Session> = {}): SessionEntry {
  const session = {
    id, name: id, runtime: 'claude-code', cwd: '/home/me/projects/web', source: 'adopted', machine: 'hub',
    state: 'idle', needs_attention: false, updated_at: '2026-10-25T10:00:00Z', ...over,
  } as Session // prettier-ignore
  return { key: `d1/${id}`, daemon, session }
}

const entries = [
  entry('web'),
  entry('api', { cwd: '/home/me/projects/api' }),
  entry('notes', { machine: 'mac', cwd: '/Users/me/notes', needs_attention: true, state: 'needs_permission' }),
  entry('helper', { machine: 'mac', cwd: '/Users/me/notes', role: 'concierge' }), // the assistant: not counted
]

it('opens the one session a scope holds, and nothing when it holds more, or the one already open', () => {
  expect(soleSession(entries, toQuery({ device: 'mac' }, 'status'))?.session.id).toBe('notes')
  expect(soleSession(entries, toQuery({ view: 'needs' }, 'status'))?.session.id).toBe('notes')
  expect(soleSession(entries, toQuery({ device: 'hub' }, 'status'))).toBeNull() // two there
  expect(soleSession(entries, toQuery({ device: 'mac' }, 'status'), 'd1/notes')).toBeNull() // open already
  expect(soleSession(entries, toQuery({ device: 'phone' }, 'status'))).toBeNull() // none
})

it('offers "more" only for two lines or more: one more shows in its room', () => {
  expect(toggleable(9, 8)).toBe(false)
  expect(toggleable(10, 8)).toBe(true)
  expect(toggleable(6, 8)).toBe(false)
})
