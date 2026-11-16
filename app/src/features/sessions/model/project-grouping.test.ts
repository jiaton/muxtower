import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { NO_PROJECT, projectGroupOf, type SessionEntry } from './facets'
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

it('names one project the same on every device: the team project, else the repository, else none', () => {
  expect(projectGroupOf(e('a', { project: 'acme/web', project_source: 'set' }).session)).toBe('acme/web')
  expect(projectGroupOf(e('b', { git: git('/home/me/web', 'acme/web') }).session)).toBe('acme/web')
  expect(projectGroupOf(e('c', { machine: 'mac', git: git('/Users/me/code/web') }).session)).toBe('web') // no remote: its folder
  expect(projectGroupOf(e('d', { git: git('/home/me/web', null, '/home/me/web-fix') }).session)).toBe('web') // a worktree: its repo
  expect(projectGroupOf(e('f', { project: 'notes', project_source: 'folder' }).session)).toBe(NO_PROJECT) // only a folder's name
  expect(projectGroupOf(e('g', {}).session)).toBe(NO_PROJECT)
})

it('groups one project across devices; inside it what needs you, then what works, then the latest; No project last', () => {
  at = 0
  const entries = [
    e('nas-idle', { git: git('/home/me/web', 'acme/web') }),
    e('mac-busy', { machine: 'mac', state: 'busy', git: git('/Users/me/web', 'acme/web') }),
    e('loose', {}),
    e('mac-asks', { machine: 'mac', needs_attention: true, git: git('/Users/me/web', 'acme/web', '/Users/me/web-ui') }),
    e('api', { project: 'acme/api', project_source: 'set' }),
    e('pinned', { pinned: true, git: git('/home/me/web', 'acme/web') }),
  ]
  const groups = groupEntries(entries, 'project')
  expect(groups.map((g) => g.label)).toEqual(['Pinned', 'acme/web', 'acme/api', NO_PROJECT])
  const web = groups.find((g) => g.label === 'acme/web')!
  expect(web.entries.map((x) => x.session.id)).toEqual(['mac-asks', 'mac-busy', 'nas-idle'])
  expect(web.implies).toEqual({ project: true }) // rows say their device
  expect(groups.at(-1)!.implies).toEqual({ project: false })
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
