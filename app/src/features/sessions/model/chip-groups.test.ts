import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER, chipProject, chipProjects, projectChips, projectsByActivity, type ChipGroup } from './chip-groups'
import type { SessionEntry } from './facets'
import { filterEntries } from './query'
import { parseListSearch, scopeSearch, toQuery } from './search'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
let at = 0
function entry(id: string, over: Partial<Session> = {}): SessionEntry {
  at += 1
  const session = {
    id, name: id, runtime: 'claude-code', cwd: '/home/me/projects/web', source: 'adopted', machine: 'hub',
    state: 'idle', needs_attention: false, updated_at: new Date(Date.UTC(2026, 10, 5, 10, at)).toISOString(), ...over,
  } as Session // prettier-ignore
  return { key: `d1/${id}`, daemon, session }
}

const git = (repo: string) => ({ repo, worktree: repo, branch: 'main', remote: null }) as Session['git']

describe('a session’s project', () => {
  it('is the one set, else its repository’s, else its folder’s name', () => {
    expect(chipProject(entry('a', { project: 'muxtower', project_source: 'set', cwd: '/tmp/x' }).session)).toBe('muxtower')
    expect(chipProject(entry('a', { project: 'jiaton/ha', project_source: 'git remote', git: git('/home/me/ha') }).session)).toBe(
      'jiaton/ha',
    )
    expect(chipProject(entry('a', { git: git('/home/me/projects/web') }).session)).toBe('web')
    expect(chipProject(entry('a', { cwd: '/home/me/notes', project: 'notes', project_source: 'folder' }).session)).toBe('notes')
    expect(chipProject(entry('a', { cwd: '/Users/me/notes' }).session)).toBe('notes') // a named folder is no Other
  })

  it('is Other in home, /, a temp folder, or no folder at all', () => {
    for (const cwd of ['/home/me', '/Users/me/', '/root', '/', '/tmp/claude-1000/x', '/private/tmp', '/var/folders/ab/T', null, ''])
      expect(chipProject(entry('a', { cwd: cwd as string }).session), String(cwd)).toBe(OTHER)
  })
})

const entries = [
  entry('mux-1', { project: 'muxtower', project_source: 'set' }),
  entry('ha-1', { project: 'ha', project_source: 'set', needs_attention: true, state: 'needs_permission' }),
  entry('mux-2', { project: 'muxtower', project_source: 'set', state: 'busy' }),
  entry('scratch', { cwd: '/home/me' }),
  entry('web', { cwd: '/home/me/web' }),
  entry('gone', { project: 'old', project_source: 'set', hidden: true }), // hidden: not listed, no chip
]
const focus: ChipGroup = { id: 'focus', name: 'Focus', projects: ['muxtower', 'ha'] }

describe('the second row', () => {
  it('orders projects by who needs the owner, then by activity, Other last', () => {
    expect(projectsByActivity(entries)).toEqual(['ha', 'web', 'muxtower', OTHER])
  })

  it('shows the groups in their order, else a chip per project, and nothing for a single project', () => {
    const rest: ChipGroup = { id: 'rest', name: 'Rest', projects: [OTHER] }
    expect(projectChips([rest, focus], entries)?.map((c) => c.label)).toEqual(['Rest', 'Focus'])
    expect(projectChips([], entries)?.map((c) => c.id)).toEqual(['p:ha', 'p:web', 'p:muxtower', `p:${OTHER}`])
    expect(projectChips([], entries.slice(0, 1))).toBeNull()
    expect(chipProjects('focus', [focus])).toEqual(['muxtower', 'ha'])
    expect(chipProjects('p:web', [])).toEqual(['web'])
    expect(chipProjects('deleted', [focus])).toBeNull() // a group since deleted narrows nothing
  })

  it('narrows the view chosen in the first row, and counts what it holds', () => {
    const shown = (view: 'all' | 'needs' | 'working', projects?: string[]) =>
      filterEntries(entries, { view, group: 'status', projects }).map((e) => e.session.id)
    expect(shown('all', focus.projects)).toEqual(['mux-1', 'ha-1', 'mux-2'])
    expect(shown('needs', focus.projects)).toEqual(['ha-1'])
    expect(shown('working', focus.projects)).toEqual(['mux-2'])
    expect(shown('all', [OTHER])).toEqual(['scratch'])
    expect(shown('all', ['old'])).toEqual([]) // a project with no listed session counts none
  })
})

describe('the rows combine', () => {
  const now = parseListSearch({ view: 'needs', chip: 'focus', q: 'deploy' })
  it('a group keeps the view, a view keeps the group, All clears only the view', () => {
    expect(scopeSearch(parseListSearch({ view: 'needs' }), { chip: 'focus' })).toMatchObject({ view: 'needs', chip: 'focus' })
    expect(scopeSearch(now, { view: 'working' })).toMatchObject({ view: 'working', chip: 'focus', q: 'deploy' })
    expect(scopeSearch(now, { view: 'all' })).toMatchObject({ view: undefined, chip: 'focus' })
    expect(scopeSearch(now, { chip: '' }).chip).toBeUndefined() // the chosen chip again: let go
  })
  it('a device or an agent clears the group', () => {
    expect(scopeSearch(now, { device: 'mac' }).chip).toBeUndefined()
    expect(scopeSearch(now, { agent: 'Codex' }).chip).toBeUndefined()
    expect(toQuery(now, 'status').view).toBe('needs')
  })
})
