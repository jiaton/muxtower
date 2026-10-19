import { expect, it } from 'vitest'
import { launchNav } from '@/state/launch'
import { current, initialNav } from '@/state/model'
import { NOW, appState, session, waiting } from '@/test/fixtures'
import { homeAct, homeRows } from './home'
import { menuAct } from '.'
import { layout, sessionAct, sessionView } from './session'

it('home lists the longest wait first, then machines with the hub first', () => {
  const state = appState([
    session('idle-1', { machine: 'zeta' }),
    waiting('late', '2026-10-18T11:59:00Z'),
    waiting('early', '2026-10-18T11:00:00Z', { machine: null }),
  ])
  expect(homeRows(state, NOW).map((r) => r.id)).toEqual(['s:early', 's:late', 'divider', 'g:hub', 'g:box', 'g:zeta'])
})

it('home opens what the cursor is on; back leaves the app', () => {
  const state = appState([waiting('a', '2026-10-18T11:00:00Z')])
  const opened = homeAct(state, 'select', NOW)
  expect(current(opened.nav)).toEqual({ screen: 'session', id: 'a' })
  expect(opened.nav.lastOpened).toBe('a')
  expect(homeAct(state, 'back', NOW).command).toEqual({ type: 'exit' })
})

it('approving takes two taps on the same choice', () => {
  const nav = { ...initialNav(), stack: [{ screen: 'home' as const }, { screen: 'session' as const, id: 'a' }] }
  let state = appState([waiting('a', '2026-10-18T11:00:00Z')], { nav })
  const first = sessionAct(state, 'a', 'select')
  expect(first.command).toBeUndefined()
  expect(first.nav.armed).toBe('allow')
  state = { ...state, nav: first.nav }
  expect(sessionView(state, 'a', NOW).footer).toBe('tap again: Yes')
  const moved = sessionAct(state, 'a', 'down')
  expect(moved.nav.armed).toBeNull()
  expect(sessionAct(state, 'a', 'select').command).toEqual({ type: 'approve', id: 'a', option: 'allow' })
})

it('a session shows the prompt, the choices and then the reply, paged', () => {
  const reply = Array.from({ length: 30 }, (_, i) => `line ${i} of a long reply`).join('\n')
  const s = waiting('a', '2026-10-18T11:00:00Z', { last_message: reply })
  const { lines, choices } = layout(s)
  expect(lines[0]).toContain('BASH')
  expect(choices.map((c) => c.label)).toEqual(['Yes', 'No'])
  const nav = { ...initialNav(), stack: [{ screen: 'session' as const, id: 'a' }] }
  let state = appState([s], { nav })
  for (const action of ['down', 'down', 'down'] as const) state = { ...state, nav: sessionAct(state, 'a', action).nav }
  const view = sessionView(state, 'a', NOW)
  expect(view.body.some((l) => l.includes('>'))).toBe(false)
  expect(view.footer).toMatch(/^\d\/\d · /)
})

it('the menu denies only what is pending', () => {
  const nav = { ...initialNav(), stack: [{ screen: 'session' as const, id: 'a' }] }
  expect(menuAct(appState([waiting('a', '2026-10-18T11:00:00Z')], { nav }), 1).command).toEqual({ type: 'deny', id: 'a' })
  expect(menuAct(appState([session('a')], { nav }), 1).notice).toBe('Nothing to deny')
  expect(menuAct(appState([session('a')]), 2).notice).toBe('Open a session first')
})

it('launch opens the one session that needs the owner, else returns to the last place', () => {
  const one = launchNav(initialNav(), [waiting('a', '2026-10-18T11:00:00Z'), session('b')], 'hub')
  expect(current(one)).toEqual({ screen: 'session', id: 'a' })
  const back = launchNav({ ...initialNav(), lastOpened: 'b' }, [session('b')], 'hub')
  expect(current(back)).toEqual({ screen: 'home' })
  expect(back.cursors.home).toBe('g:box')
})
