import { expect, it } from 'vitest'
import { appState, session } from '@/test/fixtures'
import type { Voice } from '@/state/model'
import { act, view } from '.'
import { layout } from './session'

const voice = (phase: Voice['phase'], text = ''): Voice => ({ session: 'a', phase, text })

it('a reply shows what was heard and sends it on tap', () => {
  const state = appState([session('a')], { voice: voice('ready', '继续，然后跑测试') })
  expect(view(state, 0).screen.body.join('')).toContain('继续，然后跑测试')
  const sent = act(state, 'select', 0)
  expect(sent.command).toEqual({ type: 'input', id: 'a', text: '继续，然后跑测试' })
  expect(sent.voice).toBeNull()
})

it('a reply can be cancelled and is not sent while listening', () => {
  const listening = appState([session('a')], { voice: voice('listening') })
  expect(act(listening, 'select', 0).command).toBeUndefined()
  expect(view(listening, 0).screen.footer).toBe('release to stop')
  expect(act(listening, 'back', 0).voice).toBeNull()
})

it('the hub summary comes first and the full reply after a marker', () => {
  const long = 'A very long reply. '.repeat(40)
  const { lines } = layout(session('a', { last_message: long, reply_summary: 'Short version.' }))
  expect(lines[0]).toBe('Short version.')
  expect(lines).toContain('── full reply ──')
  expect(layout(session('a', { last_message: 'short' })).lines).toEqual(['short'])
})
