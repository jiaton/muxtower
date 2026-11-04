import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { facetsOf } from './counts'
import type { SessionEntry } from './facets'
import { homeKind, homeOf, worktreeOf } from './places'
import { filterEntries, groupEntries } from './query'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const SHOP = '/home/me/projects/shop'
const git = (worktree: string, branch: string | null = 'main', repo = SHOP) => ({ repo, worktree, branch, remote: 'acme/shop' })

function entry(id: string, over: Partial<Session> = {}): SessionEntry {
  const session = { id, name: id, runtime: 'claude-code', cwd: SHOP, source: 'adopted', machine: 'hub', state: 'idle', needs_attention: false, updated_at: '2026-11-03T10:00:00Z', ...over } as Session // prettier-ignore
  return { key: `d1/${id}`, daemon, session }
}

// Every kind of place a session can be in, as the daemon reports it (`session.git`).
const main = entry('main', { git: git(SHOP) })
const sub = entry('sub', { cwd: `${SHOP}/src/api`, git: git(SHOP) })
const inside = entry('inside', { cwd: `${SHOP}/.worktrees/fix`, git: git(`${SHOP}/.worktrees/fix`, 'fix') })
const outside = entry('outside', { cwd: '/home/me/projects/shop-teams', git: git('/home/me/projects/shop-teams', 'teams') })
const submodule = entry('submodule', { cwd: `${SHOP}/vendor/lib`, git: git(`${SHOP}/vendor/lib`, 'main', `${SHOP}/vendor/lib`) })
const plain = entry('plain', { cwd: '/home/me/notes' })
const unknown = entry('unknown', { cwd: '' })
const named = entry('named', {
  cwd: '/home/me/projects/shop-teams',
  git: git('/home/me/projects/shop-teams', 'teams'),
  project: 'Payments',
  project_source: 'set',
})

describe('where a session is listed', () => {
  it('goes by the project someone set, else its repository (worktrees under it), else its folder', () => {
    expect([main, sub, inside, outside].map((e) => homeOf(e.session))).toEqual(Array(4).fill('~/projects/shop'))
    expect(homeOf(submodule.session)).toBe('~/projects/shop/vendor/lib') // the innermost repository
    expect([homeOf(plain.session), homeOf(unknown.session), homeOf(named.session)]).toEqual(['~/notes', null, 'Payments'])
    expect([main, plain, named].map((e) => homeKind(e.session))).toEqual(['repository', 'folder', 'project'])
    expect(worktreeOf(main.session)).toBeNull() // the main worktree
    expect(worktreeOf(sub.session)).toBeNull() // a subfolder of it
    expect(worktreeOf(outside.session)).toEqual({
      label: '~/projects/shop-teams', under: '~/projects/shop', name: 'teams', path: '/home/me/projects/shop-teams',
    }) // prettier-ignore
    expect(worktreeOf(inside.session)?.name).toBe('fix')
    expect(worktreeOf(named.session)).toBeNull() // a project set by hand wins over git
  })

  it('lists a repository with its worktrees under it, in the list and the sidebar', () => {
    const all = [main, sub, inside, outside, submodule, plain, named]
    const [device] = groupEntries(all, 'device')
    const sections = device.sections!.map((s) => [s.label, s.depth, s.name, s.kind, s.entries.map((e) => e.session.id)])
    expect(sections).toEqual([
      ['~/projects/shop', 0, '~/projects/shop', 'repository', ['main', 'sub']],
      ['~/projects/shop-teams', 1, 'teams', 'worktree', ['outside']], // a worktree outside it, by its branch
      ['~/projects/shop/.worktrees/fix', 1, 'fix', 'worktree', ['inside']],
      ['~/projects/shop/vendor/lib', 1, 'vendor/lib', 'repository', ['submodule']], // a repository of its own
      ['~/notes', 0, '~/notes', 'folder', ['plain']],
      ['Payments', 0, 'Payments', 'project', ['named']],
    ])
    const folders = facetsOf(all).devices[0].folders
    expect(folders.find((f) => f.label === '~/projects/shop-teams')).toMatchObject({
      under: '~/projects/shop',
      name: 'teams',
      kind: 'worktree',
    })
    // The repository's view holds its worktrees; a worktree's, only itself.
    const ids = (folder: string) => filterEntries(all, { view: 'all', group: 'status', folder }).map((e) => e.session.id)
    expect(ids('~/projects/shop')).toEqual(['main', 'sub', 'inside', 'outside'])
    expect(ids('~/projects/shop-teams')).toEqual(['outside'])
  })

  it('goes by the project my_team says, wherever its agent works now, and not by a folder’s name', () => {
    const auto = { project: 'acme/shop', project_auto: true, project_source: 'git remote' as const }
    const kept = entry('kept', { ...auto, git: git(SHOP), working_dir: '/home/me/projects/other' })
    const tree = entry('tree', { ...auto, cwd: '/home/me/projects/shop-teams', git: git('/home/me/projects/shop-teams', 'teams') })
    const loose = entry('loose', { cwd: '/home/me/notes', project: 'notes', project_auto: true, project_source: 'folder' })
    expect([homeOf(kept.session), homeKind(kept.session)]).toEqual(['acme/shop', 'project']) // as my_team says
    expect(worktreeOf(tree.session)).toMatchObject({ under: 'acme/shop', name: 'teams' }) // its worktree under it
    expect([homeOf(loose.session), homeKind(loose.session)]).toEqual(['~/notes', 'folder']) // the folder tree says
  })

  it('nests a project where most of its sessions are, on each device, like any repository', () => {
    const MUX = '/home/me/projects/mux'
    const set = { project: 'mux', project_source: 'set' as const }
    const projects = entry('projects', { cwd: '/home/me/projects' }) // a plain folder holding the repositories
    const notes = entry('notes', { cwd: '/home/me/projects/notes', git: git('/home/me/projects/notes', 'main', '/home/me/projects/notes') })
    const m1 = entry('m1', { ...set, cwd: MUX, git: git(MUX, 'main', MUX), project_anchor: MUX })
    const m2 = entry('m2', { ...set, cwd: `${MUX}-teams`, git: git(`${MUX}-teams`, 'teams', MUX), project_anchor: MUX })
    const stray = entry('stray', { ...set, cwd: '/srv/elsewhere', project_anchor: MUX }) // listed inside, as it is
    const loose = entry('loose', { project: 'loose', project_source: 'set', cwd: '' }) // no folder known
    const mac = { ...entry('mac', { ...set, machine: 'mac', cwd: '/Users/me/mux', project_anchor: '/Users/me/mux' }) }
    const macHome = entry('mac-home', { machine: 'mac', cwd: '/Users/me' })
    const [nas, onMac] = groupEntries([projects, notes, m1, m2, stray, loose, mac, macHome], 'device')
    const tree = nas.sections!.map((s) => [s.label, s.depth, s.parent ?? null, s.name, s.entries.map((e) => e.session.id)])
    // Its name, nested where it is; a set project holds its worktrees and strays as its own rows.
    expect(tree).toContainEqual(['mux', 1, '~/projects', 'mux', ['m1', 'm2', 'stray']])
    expect(nas.sections!.find((s) => s.label === '~/projects')?.total).toBe(5) // 1 + its repositories' 4
    expect(tree).toContainEqual(['~/projects/notes', 1, '~/projects', 'notes', ['notes']]) // beside a plain repository
    expect(tree).toContainEqual(['loose', 0, null, 'loose', ['loose']]) // nowhere known: at the top
    const folders = facetsOf([projects, notes, m1, m2, stray]).devices[0].folders
    expect(folders.find((f) => f.label === 'mux')?.at).toBe('~/projects/mux')
    expect(onMac.sections!.map((s) => [s.label, s.parent ?? null])).toContainEqual(['mux', '~']) // its own, on the Mac
  })

  it('makes a repository whose sessions are all in other worktrees, to hold them', () => {
    const [device] = groupEntries([outside, plain], 'device')
    expect(device.sections!.map((s) => [s.label, s.depth, s.entries.length])).toEqual([
      ['~/notes', 0, 1],
      ['~/projects/shop', 0, 0],
      ['~/projects/shop-teams', 1, 1],
    ])
  })
})
