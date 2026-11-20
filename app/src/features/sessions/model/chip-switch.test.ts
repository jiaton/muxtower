import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { chipMembers, type ChipGroup } from './chip-groups'
import { chipLanding, NO_CHIP, stepChip } from './chip-switch'
import type { SessionEntry } from './facets'
import type { SessionQuery } from './query'

const ids = ['product', 'ops', 'pms']

describe('stepChip', () => {
  it('goes from no chip to the first, along the row in its order', () => {
    expect(stepChip(ids, undefined, 1)).toBe('product')
    expect(stepChip(ids, 'product', 1)).toBe('ops')
    expect(stepChip(ids, 'ops', -1)).toBe('product')
    expect(stepChip(ids, 'product', -1)).toBe(NO_CHIP)
  })

  it('does nothing past either end (no wrapping)', () => {
    expect(stepChip(ids, undefined, -1)).toBeNull()
    expect(stepChip(ids, 'pms', 1)).toBeNull()
  })

  it('counts a chip the row does not show as no chip', () => {
    expect(stepChip(ids, 'gone', 1)).toBe('product')
    expect(stepChip(ids, 'gone', -1)).toBeNull()
  })

  it('has nothing to step to without chips', () => {
    expect(stepChip([], undefined, 1)).toBeNull()
  })
})

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
let at = 0
function entry(id: string, project: string, over: Partial<Session> = {}): SessionEntry {
  at += 1
  const session = {
    id, name: id, runtime: 'claude-code', cwd: `/home/me/projects/${project}`, source: 'adopted', machine: 'hub', project,
    project_source: 'set', state: 'idle', needs_attention: false, updated_at: new Date(Date.UTC(2026, 10, 5, 10, at)).toISOString(), ...over,
  } as Session // prettier-ignore
  return { key: `d1/${id}`, daemon, session }
}

const groups: ChipGroup[] = [
  { id: 'a', name: 'A', projects: ['web'], sessions: [] },
  { id: 'b', name: 'B', projects: ['api'], sessions: [] },
  { id: 'empty', name: 'Empty', projects: ['nothing'], sessions: [] },
]
const query = (chip: string): SessionQuery => ({ view: 'all', group: 'project', chip: chipMembers(chip || undefined, groups) ?? undefined })
const ref = (sessionId: string) => ({ daemonId: 'd1', sessionId })
const web1 = entry('web-1', 'web')
const web2 = entry('web-2', 'web')
const api1 = entry('api-1', 'api')
const all = [web1, web2, api1]
const landing = (entries: SessionEntry[], chip: string, remembered?: string) =>
  chipLanding(entries, query(chip), remembered ? ref(remembered) : undefined)?.session.id ?? null

describe('chipLanding', () => {
  it('is the session remembered for the chip, while it is listed there', () => {
    expect(landing(all, 'a', 'web-2')).toBe('web-2')
    expect(landing(all, NO_CHIP, 'api-1')).toBe('api-1') // "All" too
  })

  it('also when it is held under another row (a fork listed under the session it was forked from)', () => {
    expect(landing([...all, entry('web-fork', 'web', { fork_of: 'web-1' })], 'a', 'web-fork')).toBe('web-fork')
  })

  it('else the chip’s first session in the list’s order', () => {
    const first = landing(all, 'a')
    expect(['web-1', 'web-2']).toContain(first)
    expect(landing(all, 'a', 'gone')).toBe(first) // gone
    expect(landing([...all.filter((e) => e !== web2), entry('web-2', 'web', { archived_at: '2026-11-05T11:00:00Z' })], 'a', 'web-2')).toBe(
      'web-1',
    ) // archived
    expect(landing([web1, entry('web-2', 'api'), api1], 'a', 'web-2')).toBe('web-1') // moved out of the chip
    expect(landing(all, 'b', 'web-1')).toBe('api-1') // never one of another chip
  })

  it('is none for an empty chip', () => {
    expect(landing(all, 'empty', 'web-1')).toBeNull()
    expect(landing([], NO_CHIP)).toBeNull()
  })
})
