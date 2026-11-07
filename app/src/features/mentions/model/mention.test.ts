import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { mentionAt, mentionOf, mentionsIn, recentMentions, rememberMention, rowsFor, search, type Row } from './mention'

let at = 0
function s(id: string, over: Partial<Session> = {}): Session {
  at += 1
  return {
    id,
    name: id,
    team_role: null,
    project: null,
    machine: 'nas',
    state: 'idle',
    needs_attention: false,
    hidden: false,
    archived_at: null,
    role: null,
    updated_at: `2026-11-07T00:00:${String(at).padStart(2, '0')}Z`,
    ...over,
  } as Session
}

const ids = (rows: Row[]) => rows.map((r) => (r.kind === 'session' ? r.session.id : `[${r.project} · ${r.count}]`))

afterEach(() => localStorage.clear())

describe('mentionAt', () => {
  it('starts at the start of the box or after whitespace, and never inside a word', () => {
    expect(mentionAt('@wo', 3)).toEqual({ start: 0, query: 'wo' })
    expect(mentionAt('hi @', 4)).toEqual({ start: 3, query: '' })
    expect(mentionAt('line\n@pm', 8)).toEqual({ start: 5, query: 'pm' })
    expect(mentionAt('mail me at a@b', 14)).toBeNull() // inside a word: an e-mail
    expect(mentionAt('@worker done', 12)).toBeNull() // past the space: no longer typing one
    expect(mentionAt('@worker done', 4)).toEqual({ start: 0, query: 'wor' }) // the caret back in it
  })
})

describe('what is inserted', () => {
  it('is @role@project (id), the name standing in for no role; and reads back', () => {
    const worker = s('4ae73fa60eb1', { team_role: 'worker', project: 'jiaton/muxtower', name: 'Muxtower Worker' })
    expect(mentionOf(worker)).toBe('@worker@jiaton/muxtower (4ae73fa60eb1)')
    const unnamed = s('c1', { name: 'Home  assistant', project: 'ha' })
    expect(mentionOf(unnamed)).toBe('@Home assistant@ha (c1)')
    expect(mentionOf(s('mac~5daadcdf20d6', { name: 'job', project: null }))).toBe('@job (mac~5daadcdf20d6)')
    const pm = s('6c41dc7fb586', { team_role: 'PM — 只读：回答 owner 的问题、调研', project: 'jiaton/quant-invest' })
    expect(mentionOf(pm)).toBe('@PM@jiaton/quant-invest (6c41dc7fb586)') // a role's title, not all it says
    expect(mentionOf(s('g2', { team_role: 'g2 worker: glasses/ client', project: 'm' }))).toBe('@g2 worker@m (g2)')
    expect(mentionOf(s('t', { team_role: '讲解员（临时，mac）— 只读', project: 'q' }))).toBe('@讲解员（临时，mac）@q (t)')
    expect(mentionOf(s('w', { team_role: 'quant-invest worker', project: 'q' }))).toBe('@quant-invest worker@q (w)')
    expect(mentionOf(s('x', { name: 'a'.repeat(40) }))).toBe(`@${'a'.repeat(31)}… (x)`)
    expect(mentionsIn('ask @worker@jiaton/muxtower (4ae73fa60eb1) and @job (mac~5daadcdf20d6) now')).toEqual([
      { handle: 'worker', project: 'jiaton/muxtower', id: '4ae73fa60eb1' },
      { handle: 'job', project: null, id: 'mac~5daadcdf20d6' },
    ])
  })
})

describe('rowsFor', () => {
  const me = s('me', { project: 'p', team_role: 'worker' })
  const sessions = [
    me,
    s('pm', { project: 'p', team_role: 'PM' }),
    s('ha1', { project: 'ha' }),
    s('ha2', { project: 'ha' }),
    s('ha3', { project: 'ha', needs_attention: true }),
    s('q1', { project: 'quant' }),
    s('gone', { project: 'p', archived_at: '2026-11-01T00:00:00Z' }),
    s('away', { project: 'p', hidden: true }),
  ]

  it('offers its team, then the sessions mentioned lately, then each other project folded', () => {
    expect(ids(rowsFor(sessions, me, '', ['q1', 'pm']))).toEqual(['pm', 'q1', '[ha · 3]'])
  })

  it('leaves out itself, archived and hidden sessions', () => {
    const all = ids(rowsFor(sessions, me, '', [], new Set(['p', 'ha', 'quant'])))
    expect(all).not.toContain('me')
    expect(all).not.toContain('gone')
    expect(all).not.toContain('away')
  })

  it('opens a folded project in place, those that need the owner first', () => {
    expect(ids(rowsFor(sessions, me, '', [], new Set(['ha'])))).toEqual(['pm', 'ha3', 'ha2', 'ha1', '[quant · 1]'])
  })

  it('keeps three recent mentions at most', () => {
    expect(ids(rowsFor(sessions, me, '', ['ha1', 'ha2', 'q1', 'ha3']))).toEqual(['pm', 'ha1', 'ha2', 'q1', '[ha · 1]'])
  })

  it('in the assistant: those that need the owner first, then recent mentions, then every project folded', () => {
    const assistant = s('assistant', { role: 'concierge', project: 'projects' })
    const rows = ids(rowsFor([...sessions, assistant], assistant, '', ['q1']))
    expect(rows).toEqual(['ha3', 'q1', '[ha · 2]', '[p · 2]'])
  })

  it('with a query, searches every project by role, name and project, expanded', () => {
    expect(ids(rowsFor(sessions, me, 'quant', []))).toEqual(['q1']) // by project, folded or not
    expect(ids(rowsFor(sessions, me, 'pm', []))).toEqual(['pm']) // by role
    expect(ids(rowsFor(sessions, me, 'ha2', []))).toEqual(['ha2']) // by name
  })
})

describe('search', () => {
  it('ranks a word start above inside above letters in order', () => {
    const list = [s('a', { name: 'pigment' }), s('b', { name: 'helpme' }), s('c', { name: 'muxtower PM' }), s('d', { name: 'gate' })]
    expect(search(list, 'pm').map((x) => x.id)).toEqual(['c', 'b', 'a']) // a word start, inside, p…m in order
    expect(search(list, 'zz')).toEqual([])
  })
})

describe('recent mentions', () => {
  it('are kept per daemon on this browser, newest first, and storage that fails changes nothing', () => {
    rememberMention('d1', 'a')
    rememberMention('d1', 'b')
    rememberMention('d1', 'a')
    rememberMention('d2', 'z')
    expect(recentMentions('d1')).toEqual(['a', 'b'])
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(recentMentions('d1')).toEqual([])
    expect(() => rememberMention('d1', 'c')).not.toThrow()
    blocked.mockRestore()
  })
})
