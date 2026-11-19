import { expect, it } from 'vitest'
import { scenes } from './scenes'
import { DEMO_DAEMON } from './scenes/session'
import { respond } from './server'
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
