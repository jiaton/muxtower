import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER_DEVICES, deviceOf, folderOf, shortFolderNames, sourceOf, statusOf, type SessionEntry } from './facets'
import { facetsOf, filterEntries, groupEntries } from './query'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon

function entry(id: string, over: Partial<Session> = {}): SessionEntry {
  const session = {
    id,
    name: id,
    runtime: 'claude-code',
    cwd: '/home/me/projects/web',
    source: 'adopted',
    machine: 'hub',
    state: 'idle',
    needs_attention: false,
    updated_at: '2026-10-25T10:00:00Z',
    ...over,
  } as Session
  return { key: `d1/${id}`, daemon, session }
}

describe('facets', () => {
  it('classifies status, folder and source', () => {
    expect(statusOf(entry('a', { needs_attention: true, state: 'needs_permission' }).session)).toBe('needs')
    expect(statusOf(entry('a', { state: 'busy' }).session)).toBe('working')
    expect(folderOf(entry('a').session)).toBe('~/projects/web')
    expect(folderOf(entry('a', { cwd: '/root' }).session)).toBe('~')
    expect(folderOf(entry('a', { cwd: '/srv/app/' }).session)).toBe('/srv/app')
    expect(folderOf(entry('a', { cwd: '' }).session)).toBeNull()
    expect(sourceOf(entry('a', { source: 'remote_control', origin: 'claude_code_cli' }).session)).toBe('CLI')
    expect(sourceOf(entry('a', { source: 'remote_control', origin: 'desktop_app' }).session)).toBe('Desktop app')
    expect(sourceOf(entry('a', { source: 'launched' }).session)).toBe('muxtower')
    // a tmux pane that also runs Remote Control is found in tmux
    expect(sourceOf(entry('a', { source: 'adopted', origin: 'claude_code_cli' }).session)).toBe('tmux')
    expect(sourceOf(entry('a', { source: 'remote_control', origin: 'claude_desktop' }).session)).toBe('Desktop app')
    // the process file's entrypoint, as the daemon passes it on
    expect(sourceOf(entry('a', { source: 'remote_control', origin: 'claude_code_sdk_cli' }).session)).toBe('SDK')
    expect(sourceOf(entry('a', { source: 'remote_control', origin: 'claude_code_claude_vscode' }).session)).toBe('IDE')
  })

  it('names the device: the daemon machine, else the kind of machine the folder is on', () => {
    expect(deviceOf(entry('a').session)).toBe('hub')
    expect(deviceOf(entry('a', { machine: null, cwd: '/Users/me/jobs' }).session)).toBe('Mac')
    expect(deviceOf(entry('a', { machine: null, cwd: '/home/me' }).session)).toBe('Linux')
    expect(deviceOf(entry('a', { machine: null, cwd: '' }).session)).toBeNull()
  })

  it('shortens folders as far as they stay apart', () => {
    const names = shortFolderNames(['~/projects', '~/projects/web/app', '~/work/app', '~'])
    expect([...names.values()]).toEqual(['projects', 'web/app', 'work/app', '~'])
  })
})

describe('query', () => {
  const entries = [
    entry('idle-old', { updated_at: '2026-10-25T08:00:00Z' }),
    entry('idle-new', { updated_at: '2026-10-25T09:00:00Z', cwd: '/home/me/projects/api' }),
    entry('waiting-late', { needs_attention: true, state: 'needs_answer', updated_at: '2026-10-25T09:30:00Z' }),
    entry('waiting-early', { needs_attention: true, state: 'needs_permission', updated_at: '2026-10-25T09:00:00Z' }),
    entry('busy', { state: 'busy' }),
    entry('away', { source: 'remote_control', machine: null, cwd: '' }),
    entry('helper', { role: 'concierge' }),
  ]

  it('groups by status: the assistant pinned, what needs you first and longest waiting first', () => {
    const groups = groupEntries(entries, 'status')
    expect(groups.map((g) => g.label)).toEqual(['Assistant', 'Needs you', 'Working', 'Idle'])
    expect(groups[1].entries.map((e) => e.session.id)).toEqual(['waiting-early', 'waiting-late'])
    expect(groups[3].entries.map((e) => e.session.id)).toEqual(['away', 'idle-new', 'idle-old'])
  })

  it('groups by device, then folder (most sessions first), with the unknown ones last', () => {
    const groups = groupEntries(entries, 'device')
    expect(groups.map((g) => g.label)).toEqual(['Assistant', 'hub', OTHER_DEVICES])
    expect(groups[1].sections!.map((s) => [s.label, s.entries.length])).toEqual([
      ['~/projects/web', 4],
      ['~/projects/api', 1],
    ])
    expect(groups[2].sections).toBeUndefined() // only an unknown folder: no second level
    expect(groups[1].entries.map((e) => e.session.id)).toEqual(['waiting-early', 'waiting-late', 'busy', 'idle-old', 'idle-new'])
    expect(groups[1].implies).toEqual({ device: true, folder: true })
  })

  it('puts finished turns nobody has looked at between what needs you and what works', () => {
    const withNews = [...entries, entry('finished', { unread: true, updated_at: '2026-10-25T09:45:00Z' })]
    expect(statusOf(withNews.at(-1)!.session)).toBe('unread')
    expect(groupEntries(withNews, 'status').map((g) => g.label)).toEqual(['Assistant', 'Needs you', 'Finished, unread', 'Working', 'Idle'])
    expect(filterEntries(withNews, { view: 'unread', group: 'status' }).map((e) => e.session.id)).toEqual(['finished'])
    expect(facetsOf(withNews).views.unread).toBe(1)
    // busy wins: it is working on the next turn already
    expect(statusOf(entry('a', { unread: true, state: 'busy' }).session)).toBe('working')
  })

  it('keeps hidden sessions out of every list and count but their own', () => {
    const withHidden = [...entries, entry('tucked', { hidden: true, needs_attention: true, state: 'needs_answer' })]
    const ids = (view: 'all' | 'needs' | 'hidden') => filterEntries(withHidden, { view, group: 'status' }).map((e) => e.session.id)
    expect(ids('all')).not.toContain('tucked')
    expect(ids('needs')).not.toContain('tucked')
    expect(ids('hidden')).toEqual(['tucked'])
    const facets = facetsOf(withHidden)
    expect([facets.views.all, facets.views.needs, facets.views.hidden]).toEqual([6, 2, 1])
  })

  it('keeps archived sessions in their own view, apart from hidden ones', () => {
    const withAside = [
      ...entries,
      entry('done', { archived_at: '2026-10-25T11:00:00Z' }),
      entry('tucked', { hidden: true }),
    ]
    const ids = (view: 'all' | 'hidden' | 'archived') => filterEntries(withAside, { view, group: 'status' }).map((e) => e.session.id)
    expect(ids('all')).not.toContain('done')
    expect(ids('hidden')).toEqual(['tucked'])
    expect(ids('archived')).toEqual(['done'])
    const facets = facetsOf(withAside)
    expect([facets.views.all, facets.views.hidden, facets.views.archived]).toEqual([6, 1, 1])
  })

  it('groups by source', () => {
    expect(groupEntries(entries, 'source').map((g) => g.label)).toEqual(['Assistant', 'tmux', 'Remote Control'])
  })

  it('filters by view, device, folder and text', () => {
    const ids = (q: Parameters<typeof filterEntries>[1]) => filterEntries(entries, q).map((e) => e.session.id)
    expect(ids({ view: 'needs', group: 'status' })).toEqual(['waiting-late', 'waiting-early'])
    expect(ids({ view: 'all', group: 'status', device: OTHER_DEVICES })).toEqual(['away'])
    expect(ids({ view: 'all', group: 'status', device: 'hub', folder: '~/projects/api' })).toEqual(['idle-new'])
    expect(ids({ view: 'all', group: 'status', source: 'Remote Control' })).toEqual(['away'])
    expect(ids({ view: 'all', group: 'status', q: 'BUSY' })).toEqual(['busy'])
  })

  it('counts views, devices with their folders, and sources, without the assistant', () => {
    const facets = facetsOf(entries)
    expect(facets.views).toEqual({ all: 6, needs: 2, unread: 0, working: 1, hidden: 0, archived: 0 })
    expect(facets.devices.map(({ label, count, needs }) => ({ label, count, needs }))).toEqual([
      { label: 'hub', count: 5, needs: 2 },
      { label: OTHER_DEVICES, count: 1, needs: 0 },
    ])
    expect(facets.devices[0].folders).toEqual([
      { label: '~/projects/web', count: 4, needs: 2 },
      { label: '~/projects/api', count: 1, needs: 0 },
    ])
    expect(facets.devices[1].folders).toEqual([]) // only an unknown folder
    expect(facets.sources.map((s) => s.label)).toEqual(['tmux', 'Remote Control'])
  })
})
