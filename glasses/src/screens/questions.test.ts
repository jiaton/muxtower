import { expect, it } from 'vitest'
import type { Session } from '@/hub/types'
import { initialNav, type AppState } from '@/state/model'
import { NOW, appState, session, waiting } from '@/test/fixtures'
import { layout, sessionAct, sessionView } from './session'

const asking = (questions: unknown[]): Session =>
  session('a', {
    state: 'needs_answer',
    needs_attention: true,
    last_message: 'I can store it two ways.',
    pending: { state: 'needs_answer', options: [], questions } as Session['pending'],
  })

const QUESTIONS = [
  { question: 'Which database?', header: 'DB', options: [{ label: 'SQLite' }, { label: 'Postgres' }] },
  { question: 'Which extras?', multi_select: true, options: [{ label: 'Auth' }, { label: 'Search' }, { label: 'Cache' }] },
]

const opened = (s: Session): AppState =>
  appState([s], { nav: { ...initialNav(), stack: [{ screen: 'session' as const, id: s.id }] } })

const tap = (state: AppState, action: 'select' | 'down' | 'up' = 'select') => {
  const out = sessionAct(state, 'a', action)
  return { state: { ...state, nav: out.nav }, out }
}

it('a permission prompt shows the tool and what it runs, the suggested option marked, then the context', () => {
  const s = waiting('a', '2026-10-18T11:00:00Z', { last_message: 'The build folder is stale.' })
  const { lines } = layout(s)
  expect(lines[0]).toBe('BASH npm run db:migrate')
  expect(lines[1]).toBe('Yes  (suggested)')
  expect(lines[2]).toBe('No')
  expect(lines).toContain('The build folder is stale.')
})

it('questions are asked one at a time and sent together', () => {
  let state = opened(asking(QUESTIONS))
  let view = sessionView(state, 'a', NOW)
  expect(view.body[0]).toContain('1/2 · DB Which database?')
  expect(view.body.some((l) => l.includes('Auth'))).toBe(false)
  expect(view.body).toContain('I can store it two ways.')
  ;({ state } = tap(state, 'down')) // Postgres
  ;({ state } = tap(state)) // choose
  expect(sessionView(state, 'a', NOW).footer).toBe('tap again: Postgres')
  ;({ state } = tap(state)) // confirm: next question
  view = sessionView(state, 'a', NOW)
  expect(view.body[0]).toContain('2/2 Which extras?')
  expect(view.body.find((l) => l.startsWith('>'))).toContain('[ ] Auth')
  ;({ state } = tap(state)) // tick Auth at once
  expect(sessionView(state, 'a', NOW).body.find((l) => l.startsWith('>'))).toContain('[x] Auth')
  ;({ state } = tap(state, 'down'))
  ;({ state } = tap(state, 'down'))
  ;({ state } = tap(state)) // tick Cache
  ;({ state } = tap(state, 'down')) // Done
  let out
  ;({ state, out } = tap(state))
  expect(out.command).toBeUndefined()
  ;({ out } = tap(state))
  expect(out.command).toEqual({ type: 'answer', id: 'a', answers: [['Postgres'], ['Auth', 'Cache']] })
  expect(out.nav.draft).toBeNull()
})

it('a draft for other questions is dropped', () => {
  let state = opened(asking(QUESTIONS))
  ;({ state } = tap(state))
  ;({ state } = tap(state)) // SQLite answered
  const changed = { ...state, sessions: [asking([{ question: 'Deploy now?', options: [{ label: 'Yes' }, { label: 'No' }] }])] }
  expect(sessionView(changed, 'a', NOW).body[0]).toContain('1/1 Deploy now?')
})
