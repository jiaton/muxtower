import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { OTHER } from './chip-groups'
import { groupPicks } from './chip-picks'
import type { SessionEntry } from './facets'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, project: string, minute: number, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id, name: `${id} session`, runtime: 'claude-code', cwd: `/home/me/${project}`, project, project_source: 'set',
    source: 'adopted', machine: 'hub', state: 'idle', needs_attention: false,
    updated_at: `2026-11-05T10:${String(minute).padStart(2, '0')}:00Z`, ...over,
  } as Session, // prettier-ignore
})
const entries = [
  entry('m1', 'muxtower', 1),
  entry('m2', 'muxtower', 2),
  entry('h1', 'ha', 3),
  entry('old', 'ha', 4, { archived_at: '2026-11-04T00:00:00Z' }), // archived: not offered
]

describe('ticking projects and sessions', () => {
  it('a project is all, some or none', () => {
    const picks = groupPicks(entries, { id: 'g', name: 'G', projects: ['ha'], sessions: ['m1'] })
    expect(picks.state('ha')).toBe('all')
    expect(picks.state('muxtower')).toBe('some')
    expect(picks.state(OTHER)).toBe('none')
    expect(picks.sessionsOf('ha').map((e) => e.session.id)).toEqual(['h1']) // not the archived one
  })

  it('a project ticked holds it whole; unticked, none of it', () => {
    let picks = groupPicks(entries).toggleSession('muxtower', 'm1').toggleProject('muxtower')
    expect(picks.members()).toEqual({ projects: ['muxtower'], sessions: [] })
    picks = picks.toggleProject('muxtower')
    expect(picks.members()).toEqual({ projects: [], sessions: [] })
  })

  it('every session ticked one by one stays a fixed list, never the project', () => {
    const picks = groupPicks(entries).toggleSession('muxtower', 'm1').toggleSession('muxtower', 'm2')
    expect(picks.members()).toEqual({ projects: [], sessions: ['m1', 'm2'] })
    expect(picks.state('muxtower')).toBe('some')
  })

  it('a session let go of a whole project keeps the others, one by one', () => {
    const picks = groupPicks(entries, { id: 'g', name: 'G', projects: ['muxtower'], sessions: [] }).toggleSession('muxtower', 'm2')
    expect(picks.members()).toEqual({ projects: [], sessions: ['m1'] })
  })

  it('sessions no longer known are dropped on save', () => {
    const picks = groupPicks(entries, { id: 'g', name: 'G', projects: [], sessions: ['m1', 'gone', 'old'] })
    expect(picks.members().sessions).toEqual(['m1'])
  })
})

describe('finding a session', () => {
  it('a session matched by name opens its project, showing the matching ones', () => {
    const shown = groupPicks(entries).shown('m2', [])
    expect(shown.map((s) => [s.project, s.expanded, s.sessions.map((e) => e.session.id)])).toEqual([['muxtower', true, ['m2']]])
  })
  it('a project matched by name stays as it was, opened or not', () => {
    expect(
      groupPicks(entries)
        .shown('ha', [])
        .map((s) => [s.project, s.expanded]),
    ).toEqual([['ha', false]])
    expect(
      groupPicks(entries)
        .shown('', ['ha'])
        .find((s) => s.project === 'ha')?.expanded,
    ).toBe(true)
  })
})

describe('the teams a group reaches', () => {
  it('its projects in order, then its single sessions’ projects; each once, Other and unknown left out', async () => {
    const { teamsOfGroup } = await import('./team')
    const more = [
      ...entries,
      entry('w1', 'web', 5),
      entry('x1', OTHER, 6, { cwd: '/home/me', project: undefined, project_source: undefined }),
    ]
    expect(teamsOfGroup({ id: 'g', name: 'G', projects: ['ha', OTHER, 'muxtower', 'gone'], sessions: [] }, more)).toEqual([
      'ha',
      'muxtower',
    ])
    expect(teamsOfGroup({ id: 'g', name: 'G', projects: [], sessions: ['w1', 'm2', 'm1', 'x1'] }, more)).toEqual(['web', 'muxtower'])
    expect(teamsOfGroup({ id: 'g', name: 'G', projects: ['muxtower'], sessions: ['m1', 'w1'] }, more)).toEqual(['muxtower', 'web'])
  })
})
