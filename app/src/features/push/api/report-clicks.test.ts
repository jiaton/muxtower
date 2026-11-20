import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { useDaemonsStore } from '@/lib/daemons/store'
import type { PushClickRecord } from '@/lib/push-click'
import { DAEMON_URL, server } from '@/test/server'
import { appRecord, clickEntry, postClicks } from './report-clicks'

const click: PushClickRecord = {
  id: 'c1',
  at: '2026-11-19T10:00:00.000Z',
  stage: 'sw',
  base: '/',
  target: '/d/:daemon/s/:session',
  windows: [{ path: '/d/:daemon/s/:session', visibility: 'visible', focused: true }],
  others: [],
  chosen: 0,
  message: 'sent',
  ack: true,
  ackMs: 12,
  focus: 'ok',
  fallback: 'none',
  ms: 40,
}

afterEach(() => useDaemonsStore.setState({ daemons: [] }))

it("the app's part: how long the message took and where it was, as a route pattern", () => {
  const record = appRecord(click, '/d/hub-7f3a/s/sess-secret-42', '/', Date.parse(click.at) + 80)
  expect(record).toEqual({ ...click, stage: 'app', app: { ms: 80, from: '/d/:daemon/s/:session' } })
})

it('an entry keeps only the known fields, its paths route patterns, whatever the record held', () => {
  const tampered = {
    ...click,
    target: '/d/hub-7f3a/s/sess-secret-42',
    base: '/../evil',
    windows: [{ path: '/d/hub-7f3a/s/sess-secret-42?q=text', visibility: 'visible', focused: true, title: 'Plan the launch' }],
    title: 'Plan the launch',
    body: 'secret text',
  } as unknown as PushClickRecord
  const entry = clickEntry(tampered)
  expect(Object.keys(entry).sort()).toEqual(Object.keys(click).sort())
  expect(entry).toMatchObject({ base: '/', target: '/d/:daemon/s/:session', windows: [{ path: '/d/:daemon/s/:session', visibility: 'visible', focused: true }] })
  expect(JSON.stringify(entry)).not.toMatch(/hub-7f3a|sess-secret-42|Plan the launch|secret text|text/)
})

it('posts to the daemon the notification came from, as push-click diagnostics', async () => {
  let got: unknown
  server.use(
    http.post(`${DAEMON_URL}/v1/diagnostics`, async ({ request }) => {
      got = { auth: request.headers.get('authorization'), body: await request.json() }
      return new HttpResponse(null, { status: 204 })
    }),
  )
  useDaemonsStore.setState({
    daemons: [
      { id: 'other', name: 'Other', url: 'http://other.test', token: 't0' },
      { id: 'hub', name: 'Hub', url: DAEMON_URL, token: 't1' },
    ],
  })
  await postClicks([click], '/d/hub/s/s1', '/')
  expect(got).toEqual({ auth: 'Bearer t1', body: { source: 'push-click', entries: [click] } })
})

it('nothing paired, or nothing to post: no request, no throw', async () => {
  await expect(postClicks([click], '/d/hub/s/s1', '/')).resolves.toBeUndefined()
  await expect(postClicks([], undefined, '/')).resolves.toBeUndefined()
})
