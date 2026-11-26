import { afterEach, expect, it, vi } from 'vitest'
import type { ServerFrame } from '@/lib/api/types'
import { scenes } from './scenes'
import { DEMO_DAEMON } from './scenes/session'
import { respond } from './server'
import { DemoSocket } from './socket'
import { World } from './world'

const call = (w: World, method: string, path: string) => respond(w, new Request(`${DEMO_DAEMON.url}${path}`, { method }))

it("plays a made-up summary of a session's latest reply, the same one again while that reply stands", async () => {
  const w = new World(scenes(), () => undefined)
  w.mark('shop-api', { last_message: 'All 42 payment tests pass. More words.' })
  expect(await (await call(w, 'GET', '/v1/sessions/shop-api/spoken')).json()).toEqual([])
  const first = await (await call(w, 'POST', '/v1/sessions/shop-api/spoken')).json()
  expect(first.text).toMatch(/payment tests all pass/)
  expect(first.language).toBe('en')
  expect(await (await call(w, 'POST', '/v1/sessions/shop-api/spoken')).json()).toEqual(first) // kept: not made again
  expect(await (await call(w, 'GET', '/v1/sessions/shop-api/spoken')).json()).toEqual([first])
  w.mark('shop-api', { last_message: 'Not run. What should I do instead?' })
  const next = await (await call(w, 'POST', '/v1/sessions/shop-api/spoken')).json()
  expect(next.text).toBe('Not run.') // a reply without a canned one: its first sentence
  expect(next.reply_hash).not.toBe(first.reply_hash)
})

it('has nothing to say for a session without a reply', async () => {
  const w = new World(scenes(), () => undefined)
  w.mark('shop-api', { last_message: null })
  expect((await call(w, 'POST', '/v1/sessions/shop-api/spoken')).status).toBe(404)
  expect((await call(w, 'POST', '/v1/sessions/nope/spoken')).status).toBe(404)
})

it("says a listened session's turn as it ends, as the daemon's `spoken` topic does", async () => {
  vi.useFakeTimers()
  const w = new World(scenes())
  const socket = new DemoSocket(w)
  const got: ServerFrame[] = []
  socket.onmessage = (event) => got.push(JSON.parse(String(event.data)))
  vi.runAllTimers()
  const spoken = () => got.filter((f) => f.type === 'spoken')

  w.mark('docs', { last_message: 'Wrote docs/getting-started.md' }) // not listened to: nothing said
  socket.send(JSON.stringify({ type: 'subscribe', topic: 'spoken', session_id: 'shop-api', history: 0 }))
  socket.send(JSON.stringify({ type: 'subscribe', topic: 'spoken', session_id: 'docs', history: 0 }))
  vi.runAllTimers()
  expect(got).toEqual([]) // subscribing says nothing: what was said before is not read again
  w.mark('docs', { state: 'busy', last_message: 'Wrote docs/getting-started.md, now the API page.' })
  vi.runAllTimers()
  expect(spoken()).toEqual([]) // still at work: its turn has not ended

  w.approve('shop-api', '1') // the scene runs the tests and replies
  vi.runAllTimers()
  expect(spoken()).toEqual([
    {
      type: 'spoken',
      session_id: 'shop-api',
      text: 'The payment tests all pass. A charge now retries three times, and is never taken twice.',
      reply: w.session('shop-api')!.last_message,
      language: 'en',
    },
  ])
  const played = await (await call(w, 'POST', '/v1/sessions/shop-api/spoken')).json()
  expect(played.reply).toBe(w.session('shop-api')!.last_message) // Play says the same summary, kept

  w.mark('shop-api', { pinned: true }) // the same reply: not said twice
  socket.send(JSON.stringify({ type: 'unsubscribe', topic: 'spoken', session_id: 'docs', history: 0 }))
  w.mark('docs', { state: 'idle' }) // its turn ends, but it is no longer listened to
  vi.runAllTimers()
  expect(spoken()).toHaveLength(1)
  socket.close()
})

afterEach(() => vi.useRealTimers())
