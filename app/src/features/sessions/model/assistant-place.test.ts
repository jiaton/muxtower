// The assistant (the concierge) keeps its place at the top of every view of the list.
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { filterEntries, groupEntries, type SessionQuery } from './query'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: { id, name: id, runtime: 'claude-code', cwd: '/home/me/projects', source: 'launched', machine: 'hub', state: 'idle', needs_attention: false, updated_at: '2026-11-03T10:00:00Z', ...over } as Session, // prettier-ignore
})
const assistant = entry('assistant', { name: 'Assistant', role: 'concierge' })
const busy = entry('busy', { state: 'busy', project: 'acme/web', project_source: 'set', cwd: '/home/me/web', machine: 'laptop' })
const asking = entry('asking', { needs_attention: true, project: 'acme/api', project_source: 'set' })
const all = [assistant, busy, asking]
const shown = (q: Partial<SessionQuery>) =>
  filterEntries(all, { view: 'all', group: 'status', ...q } as SessionQuery).map((e) => e.session.id)

it('the assistant is in every view of the listed sessions, whatever narrows it', () => {
  expect(shown({ view: 'working' })).toEqual(['assistant', 'busy'])
  expect(shown({ view: 'needs' })).toEqual(['assistant', 'asking'])
  expect(shown({ device: 'laptop' })).toEqual(['assistant', 'busy'])
  expect(shown({ project: 'acme/api' })).toEqual(['assistant', 'asking'])
  expect(shown({ chip: { projects: ['acme/web'], sessions: [] } })).toEqual(['assistant', 'busy'])
})

it('and at the top of the list in every grouping', () => {
  for (const by of ['status', 'project', 'device', 'none'] as const) {
    const groups = groupEntries(filterEntries(all, { view: 'all', group: by } as SessionQuery), by)
    expect(groups[0]!.entries.map((e) => e.session.id)).toEqual(['assistant'])
  }
})

it('a search for words must match it, as any session; hidden or archived, it stays where it is', () => {
  expect(shown({ q: 'busy' })).toEqual(['busy'])
  expect(shown({ q: 'assistant' })).toContain('assistant')
  const archived = entry('assistant', { name: 'Assistant', role: 'concierge', archived_at: '2026-11-04T10:00:00Z' })
  expect(filterEntries([archived, busy], { view: 'working', group: 'status' } as SessionQuery)).toEqual([busy])
})
