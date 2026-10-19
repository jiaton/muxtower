import { expect, it } from 'vitest'
import { appState, session } from '@/test/fixtures'
import type { Voice } from '@/state/model'
import { act, view } from '.'
import { layout } from './session'

const voice = (phase: Voice['phase'], text = '', mode: Voice['mode'] = 'tap'): Voice => ({ session: 'a', mode, phase, text })

it('a reply shows what was heard and sends it on tap', () => {
  const state = appState([session('a')], { voice: voice('ready', '继续，然后跑测试') })
  expect(view(state, 0).screen.body.join('')).toContain('继续，然后跑测试')
  const sent = act(state, 'select', 0)
  expect(sent.command).toEqual({ type: 'input', id: 'a', text: '继续，然后跑测试' })
  expect(sent.voice).toBeNull()
})

it('while listening the text grows live; a tap stops, a double tap cancels', () => {
  const listening = appState([session('a')], { voice: voice('listening', '让 lyric 继续') })
  expect(view(listening, 0).screen.body).toEqual(['让 lyric 继续'])
  expect(view(listening, 0).screen.footer).toBe('tap stop · 2× cancel')
  expect(act(listening, 'select', 0)).toMatchObject({ listen: 'stop' })
  expect(act(listening, 'select', 0).command).toBeUndefined()
  expect(act(listening, 'back', 0).voice).toBeNull()
  const held = appState([session('a')], { voice: voice('listening', '', 'hold') })
  expect(view(held, 0).screen.footer).toBe('release to stop · 2× cancel')
})

it('a tap while reading a session starts talking to it', () => {
  const nav = { ...appState([]).nav, stack: [{ screen: 'session' as const, id: 'a' }] }
  expect(act(appState([session('a', { last_message: 'done' })], { nav }), 'select', 0)).toMatchObject({ listen: 'start' })
})

it('the hub summary comes first and the full reply after a marker', () => {
  const long = 'A very long reply. '.repeat(40)
  const { lines } = layout(session('a', { last_message: long, reply_summary: 'Short version.' }))
  expect(lines[0]).toBe('Short version.')
  expect(lines).toContain('── full reply ──')
  expect(layout(session('a', { last_message: 'short' })).lines).toEqual(['short'])
})
