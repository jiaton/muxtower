import { expect, it } from 'vitest'
import { launchNav } from '@/state/launch'
import { current, initialNav } from '@/state/model'
import { NOW, appState, session, waiting } from '@/test/fixtures'
import { groupRows } from './group'
import { homeRows, homeView } from './home'

const archived = { archived_at: '2026-10-18T09:00:00Z' }
const interrupted = { interrupted_at: '2026-10-18T09:00:00Z' }

it('archived and hidden sessions are in no list and no count', () => {
  const state = appState([
    session('live'),
    session('old', archived),
    session('tucked', { hidden: true }),
    waiting('gone', '2026-10-18T11:00:00Z', archived),
  ])
  const rows = homeRows(state, NOW)
  expect(rows.map((r) => r.id)).toEqual(['g:box'])
  expect(rows[0].text.trim().endsWith('1')).toBe(true)
  expect(groupRows(state, 'box', NOW).map((r) => r.id)).toEqual(['live'])
  expect(homeView(state, NOW).screen.header).toContain('all quiet')
})

it('interrupted sessions are set apart after the machines, and wait on nobody', () => {
  const state = appState([session('live'), session('cut', { ...interrupted, needs_attention: true })])
  const rows = homeRows(state, NOW)
  expect(rows.map((r) => r.id)).toEqual(['g:box', 'g::interrupted'])
  expect(rows[1].text).toContain('Interrupted')
  expect(groupRows(state, ':interrupted', NOW).map((r) => r.id)).toEqual(['cut'])
  expect(groupRows(state, 'box', NOW).map((r) => r.id)).toEqual(['live'])
})

it('launch ignores archived, hidden and interrupted sessions', () => {
  const sessions = [
    waiting('a', '2026-10-18T11:00:00Z'),
    waiting('b', '2026-10-18T11:00:00Z', archived),
    waiting('c', '2026-10-18T11:00:00Z', { hidden: true }),
    waiting('d', '2026-10-18T11:00:00Z', interrupted),
  ]
  expect(current(launchNav(initialNav(), sessions, 'hub'))).toEqual({ screen: 'session', id: 'a' })
  const last = launchNav({ ...initialNav(), lastOpened: 'x' }, [session('x', archived)], 'hub')
  expect(last.cursors.home).toBeUndefined()
})

it('an archived assistant is not pinned', () => {
  const state = appState([session('helper', { role: 'concierge', ...archived }), session('w')])
  expect(homeRows(state, NOW).map((r) => r.id)).toEqual(['g:box'])
})
