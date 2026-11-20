import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { placeGroupOf, projectGroupOf, type SessionEntry } from './facets'
import { teamOf } from './team'
import { filterEntries, groupEntries } from './query'
import { presetForProject } from './new-here'

const hub = { id: 'hub', name: 'hub' } as Daemon
let at = 0
const e = (id: string, over: Partial<Session>): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id, name: id, state: 'idle', needs_attention: false, source: 'launched', on_host: true, machine: 'nas',
    cwd: `/home/me/${id}`, updated_at: new Date(Date.UTC(2026, 10, 15, 0, at++)).toISOString(), ...over,
  } as Session,
}) // prettier-ignore
const git = (repo: string, remote: string | null = null, worktree = repo) => ({ repo, worktree, remote, branch: 'main' })

it('names one project the same on every device: the team project, else the repository, else none (its folder)', () => {
  expect(projectGroupOf(e('a', { project: 'acme/web', project_source: 'set' }).session)).toBe('acme/web')
  expect(projectGroupOf(e('b', { git: git('/home/me/web', 'acme/web') }).session)).toBe('acme/web')
  expect(projectGroupOf(e('c', { machine: 'mac', git: git('/Users/me/code/web') }).session)).toBe('web') // no remote: its folder
  expect(projectGroupOf(e('d', { git: git('/home/me/web', null, '/home/me/web-fix') }).session)).toBe('web') // a worktree: its repo
  expect(projectGroupOf(e('f', { project: 'notes', project_source: 'folder' }).session)).toBeNull() // only a folder's name
  expect(placeGroupOf(e('f', { project: 'notes', project_source: 'folder', cwd: '/home/me/notes' }).session)).toEqual({
    kind: 'folder',
    name: '~/notes',
  })
  expect(placeGroupOf(e('h', { cwd: '/home/me' }).session)).toEqual({ kind: 'other', name: 'Other' }) // home
  expect(placeGroupOf(e('t', { cwd: '/tmp/x' }).session).kind).toBe('other')
  expect(placeGroupOf(e('n', { cwd: '' }).session).kind).toBe('other')
})

it('groups one project across devices; inside it what needs you, then what works, then the latest; Other last', () => {
  at = 0
  const entries = [
    e('nas-idle', { git: git('/home/me/web', 'acme/web') }),
    e('mac-busy', { machine: 'mac', state: 'busy', git: git('/Users/me/web', 'acme/web') }),
    e('loose', { cwd: '/home/me' }),
    e('mac-asks', { machine: 'mac', needs_attention: true, git: git('/Users/me/web', 'acme/web', '/Users/me/web-ui') }),
    e('api', { project: 'acme/api', project_source: 'set' }),
    e('pinned', { pinned: true, git: git('/home/me/web', 'acme/web') }),
  ]
  const groups = groupEntries(entries, 'project')
  expect(groups.map((g) => g.label)).toEqual(['Pinned', 'acme/web', 'acme/api', 'Other'])
  const web = groups.find((g) => g.label === 'acme/web')!
  expect(web.entries.map((x) => x.session.id)).toEqual(['mac-asks', 'mac-busy', 'nas-idle'])
  expect(web.implies).toEqual({ project: true }) // rows say their device
  expect(web.kind).toBe('project')
  expect(groups.at(-1)!.kind).toBeUndefined() // Other
})

it('narrows the list to a project, as the sidebar does', () => {
  const entries = [
    e('a', { git: git('/home/me/web', 'acme/web') }),
    e('b', { machine: 'mac', git: git('/Users/me/web', 'acme/web') }),
    e('c', {}),
  ]
  expect(filterEntries(entries, { view: 'all', group: 'project', project: 'acme/web' }).map((x) => x.session.id)).toEqual(['a', 'b'])
})

it('starts a new session of a project where most of its sessions run, in its repository there', () => {
  const entries = [
    e('a', { node: 'mac', machine: 'mac', on_host: false, git: git('/Users/me/web', 'acme/web') }),
    e('b', { node: 'mac', machine: 'mac', on_host: false, git: git('/Users/me/web', 'acme/web', '/Users/me/web-ui') }),
    e('c', { project: 'acme/web', project_source: 'git remote', git: git('/home/me/web', 'acme/web') }),
  ]
  expect(presetForProject(entries, ['mac'], 'acme/web')).toEqual({
    daemonId: 'hub',
    node: 'mac',
    cwd: '/Users/me/web',
    project: 'acme/web',
  })
})

it('groups sessions with no project by their folder: one name across machines, told apart on one machine', () => {
  at = 0
  const entries = [
    e('nas-ws', { cwd: '/home/me/sandbox-notes' }),
    e('mac-ws', { machine: 'mac', cwd: '/Users/me/sandbox-notes' }), // the same name on the Mac: the same group
    e('docs-a', { cwd: '/home/me/work/projects' }),
    e('docs-b', { cwd: '/home/me/play/projects' }), // the same name, another path, one machine: two groups
    e('home', { cwd: '/home/me' }),
    e('repo', { git: git('/home/me/web', 'acme/web') }),
  ]
  const groups = groupEntries(entries, 'project')
  expect(groups[0]!.label).toBe('acme/web') // projects first
  expect(groups.at(-1)!.label).toBe('Other')
  const ws = groups.find((g) => g.label === 'sandbox-notes')!
  expect(ws.kind).toBe('folder')
  expect(ws.entries.map((x) => x.session.id).sort()).toEqual(['mac-ws', 'nas-ws'])
  expect(ws.title).toBe('~/sandbox-notes') // its paths, for a tooltip (folderOf shows ~ on either machine)
  expect(groups.map((g) => g.label)).toEqual(expect.arrayContaining(['work/projects', 'play/projects']))
})

it('starts a session in a folder group on its machine and in its folder, in no team', () => {
  const entries = [e('a', { cwd: '/home/me/sandbox-notes' }), e('b', { cwd: '/home/me/sandbox-notes' })]
  expect(presetForProject(entries, [], 'sandbox-notes', false)).toEqual({
    daemonId: 'hub',
    node: null,
    cwd: '/home/me/sandbox-notes',
  })
})

it('keeps a session whose project is only its folder name in its folder group, even when a team has that name', () => {
  at = 0
  const entries = [
    e('lead', { project: 'Acme-Shop', project_source: 'set', cwd: '/home/me/acme-shop' }),
    e('worker', { project: 'acme-shop', project_source: 'folder', project_auto: true, cwd: '/home/me/x/acme-shop', machine: 'mac' }),
  ]
  const groups = groupEntries(entries, 'project')
  expect(groups.map((g) => g.label).sort()).toEqual(['Acme-Shop', 'acme-shop'])
  expect(groups.find((g) => g.label === 'Acme-Shop')!.entries.map((x) => x.session.id)).toEqual(['lead'])
  expect(placeGroupOf(entries[1]!.session).kind).toBe('folder')
  expect(filterEntries(entries, { view: 'all', group: 'project', project: 'Acme-Shop' }).map((x) => x.session.id)).toEqual(['lead'])
  expect(teamOf(entries, 'Acme-Shop').map((x) => x.session.id)).toEqual(['lead'])
})
