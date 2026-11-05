import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER, chipProject, projectIn } from './chip-groups'
import { facetsOf } from './counts'
import type { SessionEntry } from './facets'
import { nestFolders } from './folders'
import { filterEntries } from './query'
import { looseIn, workspacesOf } from './workspaces'

const daemon = { id: 'd1', name: 'nas', url: 'http://nas.test', token: 't' } as Daemon
const entry = (id: string, over: Partial<Session>): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: { id, name: id, machine: 'nas', state: 'idle', needs_attention: false, updated_at: '2026-11-05T10:00:00Z', ...over } as Session,
})
const git = (repo: string) => ({ repo, worktree: repo, branch: 'main', remote: null }) as Session['git']
const repo = (id: string, name: string) =>
  entry(id, {
    cwd: `/home/me/projects/${name}`,
    git: git(`/home/me/projects/${name}`),
    project: `jiaton/${name}`,
    project_source: 'git remote',
    project_anchor: `/home/me/projects/${name}`,
  })
const entries = [
  repo('m1', 'muxtower'),
  repo('m2', 'muxtower'),
  repo('v1', 'voice'),
  entry('loose', { cwd: '/home/me/projects', project: 'projects', project_source: 'folder' }), // right in the workspace
  entry('notes', { cwd: '/home/me/notes', project: 'notes', project_source: 'folder' }), // holds no repository
  entry('set', { cwd: '/home/me/projects', project: 'release', project_source: 'set', project_anchor: '/home/me/projects' }), // its project set: its own
]

describe('a folder holding repositories is a workspace', () => {
  const ws = workspacesOf(entries)
  it('its loose sessions are Other; a folder without repositories keeps its name; a set project stays', () => {
    const project = (id: string) =>
      projectIn(
        entries.find((e) => e.session.id === id)!,
        ws,
      )
    expect(project('loose')).toBe(OTHER)
    expect(project('notes')).toBe('notes')
    expect(project('set')).toBe('release')
    expect(project('m1')).toBe('jiaton/muxtower')
    expect(chipProject(entries[3].session)).toBe('projects') // without the others to tell: its folder's name
  })

  it('in the sidebar it only holds, counting everything under it, its loose sessions in "Other", last', () => {
    const [nas] = facetsOf(entries).devices
    const tree = nestFolders(nas.folders)
    const row = (label: string) => tree.find((n) => n.item.label === label)!
    expect(row('~/projects').item.count).toBe(0)
    expect(row('~/projects').total).toBe(5)
    const under = tree.filter((n) => n.parent === '~/projects').map((n) => [n.name, n.total])
    expect(under.at(-1)).toEqual(['Other', 1])
    expect(under.map(([name]) => name)).toEqual(expect.arrayContaining(['jiaton/muxtower', 'jiaton/voice', 'release']))
    expect(row('~/notes').total).toBe(1)
  })

  it('choosing it lists everything under it; choosing its Other, the loose ones', () => {
    const shown = (folder: string) =>
      filterEntries(entries, { view: 'all', group: 'status', device: 'nas', folder }).map((e) => e.session.id)
    expect(shown('~/projects').sort()).toEqual(['loose', 'm1', 'm2', 'v1'].sort())
    expect(shown(looseIn('~/projects'))).toEqual(['loose'])
    expect(shown('~/notes')).toEqual(['notes'])
  })
})
