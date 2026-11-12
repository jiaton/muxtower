import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from './facets'
import { foldForks } from './forks'
import { buildList, foldKey, heldIn, shownRows, type GroupNode, type SectionNode } from './list'
import type { Group } from './query'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
function entry(id: string, over: Partial<Session> = {}): SessionEntry {
  const session = { id, name: id, runtime: 'claude-code', cwd: '/home/me/web', machine: 'hub', state: 'idle', needs_attention: false, ...over } as Session
  return { key: `d1/${id}`, daemon, session }
} // prettier-ignore

const implies = { device: true, folder: false, source: false, account: false, agent: false }
const section = (key: string, entries: SessionEntry[], over: Partial<Group> = {}) => ({ key, label: key, entries, ...over })

/** A device with ~/acme (holding ~/acme/api) and ~/notes; acme's "plan" has a fork. */
function device() {
  const plan = entry('plan')
  const draft = entry('draft', { fork_of: 'plan' })
  const api = entry('api', { needs_attention: true })
  const notes = entry('notes')
  const { forks } = foldForks([plan, draft, api, notes])
  const group: Group = {
    key: 'hub',
    label: 'hub',
    implies,
    entries: [plan, api, notes],
    sections: [
      section('~/acme', [plan]),
      section('~/acme/api', [api], { depth: 1, parent: '~/acme', name: 'api' }),
      section('~/notes', [notes]),
    ],
  }
  return { group, held: { forks } }
}
const names = (rows: { entry: SessionEntry }[]) => rows.map((r) => r.entry.session.id)

describe('buildList', () => {
  it('nests a device’s folders, each with its rows then the folders inside it', () => {
    const { group, held } = device()
    const [hub] = buildList([group], held, { scope: 'device', collapsed: [] })
    expect(hub!.sectioned).toBe(true)
    expect(hub!.count).toBe(4) // forks counted
    const [acme, notes] = hub!.children as SectionNode[]
    expect([acme!.label, notes!.label]).toEqual(['acme', 'notes']) // short names
    expect(acme!.children.map((c) => (c.kind === 'row' ? c.entry.session.id : c.label))).toEqual(['plan', 'api'])
    expect(names(heldIn(acme!))).toEqual(['plan', 'api'])
    expect(names(shownRows([hub!]))).toEqual(['plan', 'draft', 'api', 'notes'])
  })

  it('counts what a folded folder holds, its inner folders and forks included, and who needs you', () => {
    const { group, held } = device()
    const scope = 'device'
    const [hub] = buildList([group], held, { scope, collapsed: [foldKey(scope, 'hub', '~/acme')] })
    const acme = hub!.children[0] as SectionNode
    expect(acme).toMatchObject({ folded: true, count: 3, needs: 1 }) // plan, its fork, api
    expect(names(shownRows([hub!]))).toEqual(['notes'])
    const open = buildList([group], held, { scope, collapsed: [] })[0]!.children[0] as SectionNode
    expect(open).toMatchObject({ folded: false, count: 1, needs: 0 }) // its own rows, as shown
  })

  it('folds a group by its key, starts every group folded when asked, and folds nothing in a search', () => {
    const { group, held } = device()
    const scope = 'archived:device'
    const fold = (collapsed: string[], more = {}) => buildList([group], held, { scope, collapsed, ...more })[0] as GroupNode
    expect(fold([foldKey(scope, 'hub')])).toMatchObject({ folded: true, needs: 1 })
    expect(fold([], { foldedFirst: true }).folded).toBe(true)
    expect(fold([foldKey(scope, 'hub')], { foldedFirst: true }).folded).toBe(false) // opened
    expect(fold([foldKey(scope, 'hub')], { unfolded: true })).toMatchObject({ folded: false, foldable: false })
    expect(buildList([group], held, { collapsed: [] })[0]!.foldable).toBe(false) // no scope: nothing folds
  })

  it('builds fork trees with their rails, kept open while a fork in them needs you', () => {
    const top = entry('plan')
    const a = entry('draft', { fork_of: 'plan' })
    const aa = entry('polish', { fork_of: 'draft' })
    const b = entry('budget', { fork_of: 'plan', needs_attention: true })
    const { shown, forks } = foldForks([top, a, aa, b])
    const group: Group = { key: 'all', label: 'All', implies, entries: shown }
    const [row] = buildList([group], { forks }, { scope: 'none', collapsed: [foldKey('forks', 'd1/plan')] })[0]!.children
    if (row?.kind !== 'row') throw new Error('a row')
    expect(row).toMatchObject({ forkCount: 2, forksAsking: true, forksOpen: true }) // folded, but budget needs you
    const [draft, budget] = row.forks
    expect(draft).toMatchObject({ depth: 1, last: false, rails: [] })
    expect(draft!.forks[0]).toMatchObject({ depth: 2, last: true, rails: [true] }) // plan's rail goes on past it
    expect(budget).toMatchObject({ depth: 1, last: true })
  })
})
