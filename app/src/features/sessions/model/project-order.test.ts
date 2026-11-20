import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { groupEntries } from './query'
import { compareInProject, movedTo, leads, inProjectOrder } from './project-order'

const hub = { id: 'hub', name: 'hub' } as Daemon
let made = 0
/** A session of `project` (none: a folder of its own; '~': home, Other), created in the order made. */
const e = (id: string, project: string | null, over: Partial<Session> = {}): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id, name: id, state: 'idle', needs_attention: false, source: 'launched', on_host: true, machine: 'build-box',
    cwd: project === '~' ? '/home/me' : `/home/me/${project ?? id}`,
    ...(project && project !== '~' ? { project, project_source: 'set' } : {}),
    created_at: new Date(Date.UTC(2026, 10, 1, 0, made++)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 10, 15)).toISOString(),
    ...over,
  } as Session,
}) // prettier-ignore

const labels = (entries: SessionEntry[], order: string[] = []) => groupEntries(entries, 'project', order).map((g) => g.label)
const ids = (entries: SessionEntry[], label: string, order: string[] = []) =>
  groupEntries(entries, 'project', order)
    .find((g) => g.label === label)!
    .entries.map((x) => x.session.id)

it('puts projects by name by default, then folder groups by name, then Other', () => {
  const entries = [e('a', 'zeta'), e('b', '~'), e('c', null), e('d', 'Alpha'), e('f', 'beta'), e('g', null, { cwd: '/home/me/aardvark' })]
  expect(labels(entries)).toEqual(['Alpha', 'beta', 'zeta', 'aardvark', 'c', 'Other'])
})

it('puts projects in the owner’s order, those it does not hold after them by name; folders never mix in', () => {
  const entries = [e('a', 'zeta'), e('b', 'alpha'), e('c', 'beta'), e('d', 'gamma'), e('f', null, { cwd: '/home/me/aaa' })]
  expect(labels(entries, ['zeta', 'gone', 'beta'])).toEqual(['zeta', 'beta', 'alpha', 'gamma', 'aaa'])
})

it('inside a project: a PM or a lead first, then the rest, each by when it was created', () => {
  const entries = [
    e('worker-1', 'acme/web', { team_role: 'Worker' }),
    e('plain', 'acme/web'),
    e('tech-lead', 'acme/web', { team_role: 'Tech lead: reviews' }),
    e('pm', 'acme/web', { team_role: 'PM — plans the launch' }),
    e('worker-2', 'acme/web', { team_role: 'Worker' }),
  ]
  expect(ids(entries, 'acme/web')).toEqual(['tech-lead', 'pm', 'worker-1', 'plain', 'worker-2'])
  expect(leads(entries[3]!)).toBe(true)
  expect(leads(entries[0]!)).toBe(false)
  expect([...entries].sort(compareInProject).map((x) => x.session.id)).toEqual(ids(entries, 'acme/web'))
})

it('keeps pinned sessions at the top, out of their project', () => {
  const entries = [e('a', 'acme/web'), e('b', 'acme/api', { pinned: true }), e('c', 'acme/api')]
  expect(labels(entries)).toEqual(['Pinned', 'acme/api', 'acme/web'])
  expect(ids(entries, 'Pinned')).toEqual(['b'])
})

it('nothing moves when a session needs you, starts working or says something', () => {
  const entries = [e('a', 'acme/api'), e('b', 'acme/api'), e('c', 'acme/web'), e('d', 'acme/web')]
  const before = groupEntries(entries, 'project', ['acme/web']).map((g) => [g.label, g.entries.map((x) => x.session.id)])
  const changed = entries.map((x, i) => ({
    ...x,
    session: {
      ...x.session,
      needs_attention: i === 1 || i === 3,
      state: i === 2 ? 'busy' : x.session.state,
      updated_at: new Date(Date.UTC(2026, 10, 16, i)).toISOString(),
      unread: true,
    } as Session,
  }))
  const after = groupEntries(changed, 'project', ['acme/web']).map((g) => [g.label, g.entries.map((x) => x.session.id)])
  expect(after).toEqual(before)
  expect(after.map(([label]) => label)).toEqual(['acme/web', 'acme/api'])
})

it('a new session takes its place in its project, not the top; a new project its place by name', () => {
  const entries = [e('pm', 'acme/web', { team_role: 'PM' }), e('w1', 'acme/web'), e('api', 'acme/api')]
  const added = [...entries, e('w2', 'acme/web', { updated_at: new Date(Date.UTC(2026, 10, 20)).toISOString() }), e('new', 'acme/beta')]
  expect(ids(added, 'acme/web')).toEqual(['pm', 'w1', 'w2'])
  expect(labels(added)).toEqual(['acme/api', 'acme/beta', 'acme/web'])
})

it('a project put in place in a narrowed view moves alone, next to the shown project it was put by', () => {
  const all = ['a', 'h1', 'b', 'h2', 'c'] // h1, h2: hidden in this view
  const shown = ['a', 'b', 'c']
  expect(movedTo(all, shown, 'c', 0)).toEqual(['c', 'a', 'h1', 'b', 'h2']) // to the top: just before a
  expect(movedTo(all, shown, 'a', 2)).toEqual(['h1', 'b', 'h2', 'c', 'a']) // to the end: just after c
  expect(movedTo(all, shown, 'c', 1)).toEqual(['a', 'h1', 'c', 'b', 'h2']) // between: just before b
  // Move up / down: past the next shown project, the hidden ones skipped and left where they were.
  expect(movedTo(all, shown, 'b', 0)).toEqual(['b', 'a', 'h1', 'h2', 'c'])
  expect(movedTo(all, shown, 'b', 2)).toEqual(['a', 'h1', 'h2', 'c', 'b'])
  // Shown projects not in the order yet join at its end, as shown.
  expect(movedTo([], ['b', 'a'], 'a', 0)).toEqual(['a', 'b'])
  expect(movedTo(['a', 'b'], ['a', 'b', 'new'], 'new', 0)).toEqual(['new', 'a', 'b'])
  expect(movedTo(['a', 'b'], ['a', 'b', 'new'], 'a', 1)).toEqual(['b', 'a', 'new'])
})

it('one order for every list of projects: the owner set it, the others after by name', () => {
  const projects = [{ label: 'acme/shop' }, { label: 'acme/web' }, { label: 'acme/infra' }, { label: 'acme/api' }]
  const ordered = inProjectOrder(projects, (p) => p.label, ['acme/web', 'acme/shop'])
  expect(ordered.map((p) => p.label)).toEqual(['acme/web', 'acme/shop', 'acme/api', 'acme/infra'])
})
