import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER_DEVICES, UNKNOWN_FOLDER, folderOf, sourceOf, statusOf, type SessionEntry } from './facets'
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
    expect(sourceOf(entry('a', { origin: 'claude_code_cli' }).session)).toBe('CLI')
    expect(sourceOf(entry('a', { origin: 'desktop_app' }).session)).toBe('Desktop app')
    expect(sourceOf(entry('a', { source: 'launched' }).session)).toBe('muxtower')
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

  it('groups by device and folder with the unknown ones last', () => {
    expect(groupEntries(entries, 'device').map((g) => g.label)).toEqual(['Assistant', 'hub', OTHER_DEVICES])
    expect(groupEntries(entries, 'folder').map((g) => g.label)).toEqual(['Assistant', '~/projects/api', '~/projects/web', UNKNOWN_FOLDER])
  })

  it('filters by view, device, folder and text', () => {
    const ids = (q: Parameters<typeof filterEntries>[1]) => filterEntries(entries, q).map((e) => e.session.id)
    expect(ids({ view: 'needs', group: 'status' })).toEqual(['waiting-late', 'waiting-early'])
    expect(ids({ view: 'all', group: 'status', device: OTHER_DEVICES })).toEqual(['away'])
    expect(ids({ view: 'all', group: 'status', folder: '~/projects/api' })).toEqual(['idle-new'])
    expect(ids({ view: 'all', group: 'status', q: 'BUSY' })).toEqual(['busy'])
  })

  it('counts views, devices and folders without the assistant', () => {
    const facets = facetsOf(entries)
    expect(facets.views).toEqual({ all: 6, needs: 2, working: 1 })
    expect(facets.devices).toEqual([
      { label: 'hub', count: 5, needs: 2 },
      { label: OTHER_DEVICES, count: 1, needs: 0 },
    ])
    expect(facets.folders[0]).toEqual({ label: '~/projects/web', count: 4, needs: 2 })
  })
})
