import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { inChip } from './chip-groups'
import { groupPicks } from './chip-picks'
import { roleKeyOf, roleLabels, roleNameOf, type SessionEntry } from './facets'
import { searchTerms } from './filter'
import { NO_ROLE, filterEntries, groupEntries } from './query'

const hub = { id: 'hub', name: 'hub' } as Daemon
let at = 0
const e = (id: string, team_role: string | null, project: string): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id, name: id, state: 'idle', needs_attention: false, source: 'launched', on_host: true, machine: 'nas', team_role,
    project, project_source: 'set', cwd: `/home/me/${id}`, updated_at: new Date(Date.UTC(2026, 10, 16, 0, at++)).toISOString(),
  } as Session,
}) // prettier-ignore
const role = (r: string | null) => e('x', r, 'p').session

it('keys a role by its leading name, before what it is for', () => {
  expect(roleKeyOf(role('PM — 只读：安排任务，跟进进度'))).toBe('pm')
  expect(roleKeyOf(role('worker — 实现需求，写测试'))).toBe('worker')
  expect(roleKeyOf(role('research — 只读：调研'))).toBe('research')
  expect(roleKeyOf(role('g2 worker: glasses/ client'))).toBe('g2 worker')
  expect(roleKeyOf(role('操盘手 — 下单'))).toBe('操盘手')
  expect(roleKeyOf(role('PM（只读）'))).toBe('pm')
  expect(roleKeyOf(role('reviewer - checks diffs'))).toBe('reviewer')
  expect(roleKeyOf(role('reviewer：看代码'))).toBe('reviewer')
  expect(roleKeyOf(role('g2-worker'))).toBe('g2-worker') // a dash inside a word is its name
  expect(roleNameOf(role('  PM  '))).toBe('PM')
  expect(roleKeyOf(role(null))).toBeNull()
  expect(roleKeyOf(role(''))).toBeNull()
  expect(roleKeyOf(role('— only a note'))).toBeNull()
})

it('shows a role as most of its sessions write it', () => {
  const labels = roleLabels([role('pm — a'), role('PM — b'), role('PM: c'), role('worker')])
  expect(labels.get('pm')).toBe('PM')
  expect(labels.get('worker')).toBe('worker')
})

const team = [
  e('a1', 'PM — 只读：排期', 'acme/web'),
  e('a2', 'worker — 实现需求', 'acme/web'),
  e('b1', 'pm: plans', 'acme/api'),
  e('b2', 'research — 只读：调研', 'acme/api'),
  e('c1', '操盘手 — 下单', 'fund'),
  e('c2', null, 'fund'),
]
const ids = (list: SessionEntry[]) => list.map((x) => x.session.id).sort()

it('a chip of roles holds that role in every project; several roles, any of them', () => {
  const pms = { projects: [], sessions: [], roles: ['pm'] }
  expect(ids(team.filter((x) => inChip(x, pms, new Set())))).toEqual(['a1', 'b1'])
  const both = { projects: [], sessions: [], roles: ['pm', 'research'] }
  expect(ids(team.filter((x) => inChip(x, both, new Set())))).toEqual(['a1', 'b1', 'b2'])
  const mixed = { projects: ['fund'], sessions: [], roles: ['pm'] } // with a project whole
  expect(ids(team.filter((x) => inChip(x, mixed, new Set())))).toEqual(['a1', 'b1', 'c1', 'c2'])
  expect(ids(filterEntries(team, { view: 'all', group: 'status', chip: pms }))).toEqual(['a1', 'b1'])
  expect(team.filter((x) => inChip(x, { projects: ['acme/web'], sessions: [] }, new Set()))).toHaveLength(2) // groups saved before roles
})

it('the group dialog offers the roles there are, the most held first, and saves the ones picked', () => {
  let picks = groupPicks(team)
  expect(picks.roles.map((r) => [r.label, r.count])).toEqual([
    ['PM', 2],
    ['research', 1],
    ['worker', 1],
    ['操盘手', 1],
  ])
  expect(picks.empty()).toBe(true)
  picks = picks.toggleRole('pm').toggleRole('research')
  expect(picks.empty()).toBe(false)
  expect(picks.members()).toEqual({ projects: [], sessions: [], roles: ['pm', 'research'] })
  expect(picks.toggleRole('pm').members().roles).toEqual(['research'])
  const kept = groupPicks(team, { id: 'g', name: 'PMs', projects: [], sessions: [], roles: ['pm', 'qa'] })
  expect(kept.hasRole('pm') && kept.hasRole('qa')).toBe(true)
  expect(kept.roles.at(-1)).toEqual({ key: 'qa', label: 'qa', count: 0 }) // held, though no session has it now
})

it('search takes role: terms by key, with the rest as text', () => {
  expect(searchTerms('role:PM')).toEqual({ roles: ['pm'], text: '' })
  expect(searchTerms('role:"g2 worker" glasses role:pm')).toEqual({ roles: ['g2 worker', 'pm'], text: 'glasses' })
  expect(ids(filterEntries(team, { view: 'all', group: 'status', q: 'role:pm' }))).toEqual(['a1', 'b1'])
  expect(ids(filterEntries(team, { view: 'all', group: 'status', q: 'role:pm api' }))).toEqual(['b1'])
  expect(ids(filterEntries(team, { view: 'all', group: 'status', q: '调研' }))).toEqual(['b2']) // the role's text is searched too
})

it('groups by role key, the most held first, no role last; each group says rows carry their project', () => {
  const groups = groupEntries(team, 'role')
  expect(groups.map((g) => g.label)).toEqual(['PM', 'research', 'worker', '操盘手', NO_ROLE])
  expect(ids(groups[0].entries)).toEqual(['a1', 'b1'])
  expect(groups[0].implies.role).toBe(true)
  expect(groups.at(-1)!.implies.role).toBe(false)
})
