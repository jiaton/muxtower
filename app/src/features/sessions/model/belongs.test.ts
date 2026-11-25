import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER, belongingsOf, chipKeyOf } from './belongs'
import { inChip } from './chip-groups'
import { groupPicks } from './chip-picks'
import { facetsOf } from './counts'
import type { SessionEntry } from './facets'
import { nestFolders } from './folders'
import { rank } from './match'
import { filterEntries, groupEntries } from './query'
import { looseIn } from './workspaces'

const hub = { id: 'hub', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
let at = 0
const e = (id: string, over: Partial<Session>): SessionEntry => ({
  key: `hub/${id}`,
  daemon: hub,
  session: {
    id, name: id, state: 'idle', needs_attention: false, source: 'launched', on_host: true, machine: 'nas', git: null,
    updated_at: new Date(Date.UTC(2026, 10, 20, 0, at++)).toISOString(), ...over,
  } as Session,
}) // prettier-ignore
const git = (repo: string, remote: string | null = null) => ({ repo, worktree: repo, remote, branch: 'main' })

/** Made-up sessions of every shape a place comes from. */
const entries = [
  // A repository in ~/projects: makes ~/projects a workspace.
  e('web', { cwd: '/home/me/projects/web', git: git('/home/me/projects/web', 'acme/web'), project: 'acme/web', project_source: 'git remote' }),
  // Started in the workspace, but the hub gives it a project (from git, where its agent went): that project.
  e('lyra-pm', {
    cwd: '/home/me/projects', working_dir: '/home/me/projects/lyra/app/src', project: 'acme/lyra', project_source: 'git remote',
    project_anchor: '/home/me/projects/lyra',
  }), // prettier-ignore
  e('radio', {
    cwd: '/home/me/projects', working_dir: '/home/me/projects/radio', project: 'acme/radio', project_source: 'git remote',
    project_anchor: '/home/me/projects/old-radio',
  }), // prettier-ignore
  // Right in the workspace, its project only the folder's name: Other.
  e('scripts', { cwd: '/home/me/projects', working_dir: '/home/me/projects/dots', project: 'projects', project_source: 'folder' }),
  // A plain folder holding no project: its folder.
  e('notes', { cwd: '/home/me/notes', project: 'notes', project_source: 'folder' }),
  // No folder at all.
  e('cloud', { cwd: undefined, source: 'remote_control', on_host: false, machine: undefined }),
  // On a node: a repository, and its own workspace (a folder holding a repository, a loose session in it).
  e('mac-web', { node: 'mac', machine: 'mac', cwd: '/Users/me/code/web', git: git('/Users/me/code/web', 'acme/web'), project: 'acme/web', project_source: 'git remote' }),
  e('mac-site', { node: 'mac', machine: 'mac', cwd: '/Users/me/Documents/site', git: git('/Users/me/Documents/site') }),
  e('mac-docs', { node: 'mac', machine: 'mac', cwd: '/Users/me/Documents', project: 'Documents', project_source: 'folder' }),
]

/** Where each is expected: a project, a folder (`~/notes`), or Other. */
const EXPECTED: Record<string, string> = {
  web: 'project acme/web',
  'lyra-pm': 'project acme/lyra',
  radio: 'project acme/radio',
  scripts: 'other',
  notes: 'folder notes',
  cloud: 'other',
  'mac-web': 'project acme/web',
  'mac-site': 'project site',
  'mac-docs': 'other',
}
const ids = (list: SessionEntry[]) => list.map((x) => x.session.id).sort()
const expectedIn = (chipKey: string) =>
  Object.entries(EXPECTED)
    .filter(([, where]) => (where === 'other' ? OTHER : where.split(' ')[1]) === chipKey)
    .map(([id]) => id)
    .sort()
const chipKeys = [...new Set(Object.values(EXPECTED).map((w) => (w === 'other' ? OTHER : w.split(' ')[1])))]

describe('one place per session, the same in every view', () => {
  it('the list grouped by project', () => {
    const groups = groupEntries(entries, 'project')
    const placed = Object.fromEntries(
      groups.flatMap((g) => g.entries.map((x) => [x.session.id, g.kind ? `${g.kind} ${g.label}` : g.label === 'Other' ? 'other' : g.label])),
    )
    expect(placed).toEqual(EXPECTED)
  })

  it('the list grouped by project, shown in part, still places each among all of them', () => {
    const shown = entries.filter((x) => x.session.id === 'scripts' || x.session.id === 'lyra-pm') // no repository among them
    const groups = groupEntries(shown, 'project', [], belongingsOf(entries))
    expect(groups.map((g) => [g.label, ids(g.entries)])).toEqual([
      ['acme/lyra', ['lyra-pm']],
      ['Other', ['scripts']],
    ])
  })

  it('the chip group dialog', () => {
    const picks = groupPicks(entries)
    for (const key of chipKeys) expect(ids(picks.sessionsOf(key)), key).toEqual(expectedIn(key))
    expect(picks.folder('notes')).toBe(true)
    expect(picks.folder('acme/lyra')).toBe(false)
  })

  it('chip membership and the list filtered by a chip', () => {
    const places = belongingsOf(entries)
    for (const key of chipKeys) {
      const chip = { projects: [key], sessions: [] }
      expect(ids(entries.filter((x) => inChip(x, chip, places))), key).toEqual(expectedIn(key))
      expect(ids(filterEntries(entries, { view: 'all', group: 'status', chip })), key).toEqual(expectedIn(key))
    }
  })

  it('the sidebar: its projects, and each workspace’s Other row', () => {
    const facets = facetsOf(entries)
    const projects = Object.fromEntries(facets.projects.map((p) => [p.label, p.count]))
    expect(projects).toEqual({ 'acme/web': 2, 'acme/lyra': 1, 'acme/radio': 1, site: 1 })
    const loose = (device: string, folder: string) => {
      const tree = nestFolders(facets.devices.find((d) => d.label === device)!.folders)
      return tree.find((n) => n.item.label === looseIn(folder))?.item.count ?? 0
    }
    expect(loose('nas', '~/projects')).toBe(1) // scripts alone, not the projects started there
    expect(loose('mac', '~/Documents')).toBe(1)
  })

  it('⌘K’s project term', () => {
    expect(ids(rank(entries, 'project:acme/lyra'))).toEqual(['lyra-pm'])
    expect(ids(rank(entries, 'project:other'))).toEqual(expectedIn(OTHER))
  })

  it('every view names the place by the same rule', () => {
    const places = belongingsOf(entries)
    for (const x of entries) {
      const where = EXPECTED[x.session.id]
      expect(chipKeyOf(places(x)), x.session.id).toBe(where === 'other' ? OTHER : where.split(' ')[1])
    }
  })
})

describe('the dialog’s Other', () => {
  it('no longer lists a project started in a workspace folder', () => {
    const other = groupPicks(entries)
      .shown('', [])
      .find((p) => p.project === OTHER)!
    expect(ids(other.sessions)).toEqual(['cloud', 'mac-docs', 'scripts'])
    expect(ids(other.sessions)).not.toContain('lyra-pm')
    expect(ids(other.sessions)).not.toContain('radio')
  })
})
