import { expect, it } from 'vitest'
import type { Session, TeamActivity } from '@/lib/api/types'
import { buildDiagram, centreOf, hasActivity, idleNodes, pairsOf, spokeWords, spokesOf } from './team-diagram'

const s = (id: string, over: Partial<Session> = {}) =>
  ({ id, name: id, state: 'idle', machine: 'build-box', project: 'acme/web', team_role: null, ...over }) as Session
const sessions = [
  s('pm', { team_role: 'PM — research and specs' }),
  s('w1', { team_role: 'worker', state: 'busy' }),
  s('w2', { team_role: 'worker' }),
  s('api', { team_role: 'db', project: 'acme/api' }),
]
const task = (id: number, from: string | null, to: string, status = 'delivered', at = `2026-11-15T0${id}:00:00Z`) => ({
  id, at, from_id: from, from_label: from ?? 'device phone', to_id: to, text: `task ${id}`, status, delivered_at: null,
}) // prettier-ignore
const activity: TeamActivity = {
  project: 'acme/web',
  members: ['pm', 'w1', 'w2'],
  tasks: [task(1, 'pm', 'w1'), task(2, 'pm', 'w2', 'held'), task(3, 'w1', 'pm'), task(4, null, 'pm'), task(5, 'w1', 'api')],
  messages: [{ at: '2026-11-15T06:00:00Z', from_id: 'pm', from_label: 'session pm', to_id: 'w1' }],
}

it('one node per role, the device as "you", other projects as external nodes; edges counted, held kept apart', () => {
  const d = buildDiagram(activity, sessions)
  const label = (id: string) => d.nodes.find((n) => n.id === id)?.label
  expect(d.nodes.map((n) => n.label).sort()).toEqual(['PM', 'acme/api · db', 'worker', 'you'])
  expect(d.nodes.find((n) => n.label === 'worker')).toMatchObject({ sessions: ['w1', 'w2'], state: 'busy' })
  expect(d.nodes.find((n) => n.label === 'acme/api · db')?.external).toBe(true)
  const pmToWorker = d.edges.find((e) => label(e.from) === 'PM' && label(e.to) === 'worker')!
  expect(pmToWorker).toMatchObject({ count: 2, held: 1, latest: { text: 'task 2', status: 'held' } })
  expect(d.edges.find((e) => label(e.from) === 'you')).toMatchObject({ count: 1 })
  // Messages are on the timeline only: no edge of their own.
  expect(d.edges.reduce((n, e) => n + e.count, 0)).toBe(5)
  expect(d.events.map((e) => e.kind)).toEqual(['task', 'task', 'task', 'task', 'task', 'message'])
  expect(hasActivity(d)).toBe(true)
})

it('centres on the session it was opened from, else on what the owner works with most, else on the busiest', () => {
  const d = buildDiagram(activity, sessions)
  const role = (id: string | null) => d.nodes.find((n) => n.id === id)?.label
  expect(role(centreOf(d, {}, 'w2'))).toBe('worker') // opened from a worker's session
  expect(role(centreOf(d, { pm: 1 }))).toBe('PM') // the owner typed into PM (and a device sent PM a task)
  expect(role(centreOf(d, { w1: 9 }))).toBe('worker')
  // Nobody touched by the owner, no device sender: the most traffic.
  const quiet = buildDiagram({ ...activity, tasks: activity.tasks.filter((t) => t.from_id) }, sessions)
  expect(role(centreOf(quiet, {}))).toBe('worker')
})

it('reads the centre’s pairs from its side, the others apart; roles with nothing are idle', () => {
  const d = buildDiagram(activity, sessions)
  const pairs = pairsOf(d)
  const worker = d.nodes.find((n) => n.label === 'worker')!.id
  const { spokes, also } = spokesOf(pairs, worker)
  const words = Object.fromEntries(spokes.map((sp) => [d.nodes.find((n) => n.id === sp.other)!.label, spokeWords(sp)]))
  expect(words).toEqual({ PM: 'sent 1 · got 2', 'acme/api · db': 'sent 1' })
  expect(also.map((p) => [p.a, p.b].map((id) => d.nodes.find((n) => n.id === id)!.label).sort())).toEqual([['PM', 'you']])
  expect(idleNodes(d, pairs)).toEqual([])
})

it('has nothing to draw for a team of one, or with nothing sent', () => {
  expect(hasActivity(buildDiagram({ project: 'p', members: ['pm'], tasks: [], messages: [] }, sessions))).toBe(false)
  expect(hasActivity(buildDiagram({ project: 'p', members: ['pm', 'w1'], tasks: [], messages: [] }, sessions))).toBe(false)
})
