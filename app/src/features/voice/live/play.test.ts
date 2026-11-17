import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { play } from './play'
import { useSpeech } from './speech'

const said: string[] = []
beforeEach(() => {
  said.length = 0
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: (u: { text: string }) => said.push(u.text) })
  useSpeech.setState({ unheard: {}, last: null })
})
afterEach(() => vi.unstubAllGlobals())

it("asks the hub for the latest reply's summary (kept, or made now) and says it, clearing new", async () => {
  let asked = 0
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/spoken`, () => {
      asked += 1
      return HttpResponse.json({ at: '2026-11-17T10:00:00Z', text: '部署好了', reply: 'Deployed.', reply_hash: 'h' })
    }),
  )
  const daemon = addDaemon()
  useSpeech.setState({ unheard: { [`${daemon.id}/s1`]: true } })
  expect(await play({ daemonId: daemon.id, sessionId: 's1' })).toBe(true)
  expect(asked).toBe(1)
  expect(said).toEqual(['部署好了'])
  expect(useSpeech.getState().unheard).toEqual({})
})

it('says why when it cannot', async () => {
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/spoken`, () => HttpResponse.json({ detail: '今天的语音总结已到上限' }, { status: 409 })),
  )
  const daemon = addDaemon()
  expect(await play({ daemonId: daemon.id, sessionId: 's1' })).toBe(false)
  expect(said[0]).toContain('上限')
})
