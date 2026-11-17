import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { rank, searchTerms } from './match'

const hub = { id: 'hub', name: 'hub' } as Daemon
const NOW = Date.UTC(2026, 10, 16, 12)
const e = (id: string, over: Partial<Session>): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id, name: id, state: 'idle', needs_attention: false, source: 'launched', machine: 'nas', runtime: 'claude-code',
    cwd: `/home/me/${id}`, updated_at: new Date(NOW - 3 * 86_400_000).toISOString(), ...over,
  } as Session,
}) // prettier-ignore
const ids = (list: SessionEntry[]) => list.map((x) => x.session.id)

it('ranks a name starting with the text over a word starting with it over one only containing it', () => {
  const list = [e('a', { name: 'redocument it' }), e('b', { name: 'docs index' }), e('c', { name: 'the docs site' })]
  expect(ids(rank(list, 'doc', NOW))).toEqual(['b', 'c', 'a'])
  expect(ids(rank(list, 'ocs', NOW)).sort()).toEqual(['b', 'c']) // contained: still found
})

it('weighs the name over where it runs, and lifts what waits on the owner and what moved lately', () => {
  const byFolder = e('x', { name: 'other', cwd: '/home/me/billing' })
  const byName = e('y', { name: 'billing page' })
  expect(ids(rank([byFolder, byName], 'billing', NOW))).toEqual(['y', 'x'])
  const waiting = e('w', { name: 'deploy api', needs_attention: true })
  const idle = e('i', { name: 'deploy web' })
  expect(ids(rank([idle, waiting], 'deploy', NOW))).toEqual(['w', 'i'])
  const fresh = e('f', { name: 'deploy cli', updated_at: new Date(NOW - 60_000).toISOString() })
  expect(ids(rank([idle, fresh], 'deploy', NOW))).toEqual(['f', 'i'])
})

it('narrows by role: and project: terms, the rest as text', () => {
  expect(searchTerms('project:acme/web role:"g2 worker" chart')).toEqual({ roles: ['g2 worker'], projects: ['acme/web'], text: 'chart' })
  const list = [
    e('p1', { team_role: 'PM — plans', project: 'acme/web', project_source: 'set' }),
    e('p2', { team_role: 'pm: plans', project: 'acme/api', project_source: 'set' }),
    e('w1', { team_role: 'worker', project: 'acme/web', project_source: 'set' }),
  ]
  expect(ids(rank(list, 'role:pm', NOW)).sort()).toEqual(['p1', 'p2'])
  expect(ids(rank(list, 'project:acme/web', NOW)).sort()).toEqual(['p1', 'w1'])
  expect(ids(rank(list, 'project:web role:pm', NOW))).toEqual(['p1']) // the project's last part will do
})

it('finds CJK names by any part', () => {
  const list = [e('c', { name: '操盘手 下单' }), e('d', { name: '其他' })]
  expect(ids(rank(list, '下单', NOW))).toEqual(['c'])
})
