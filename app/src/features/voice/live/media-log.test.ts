import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { FLUSH_AT, FLUSH_MS, flushMediaLog, logMedia, resetMediaLog, startMediaLog, stopMediaLog } from './media-log'

let batches: { source: string; entries: Record<string, unknown>[] }[] = []
let status = 204

beforeEach(() => {
  batches = []
  status = 204
  server.use(
    http.post(`${DAEMON_URL}/v1/diagnostics`, async ({ request }) => {
      if (status !== 204) return HttpResponse.json({ detail: 'down' }, { status })
      batches.push((await request.json()) as never)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  addDaemon()
})
afterEach(() => {
  resetMediaLog()
  vi.useRealTimers()
})

it('logs nothing outside a run', async () => {
  logMedia('action', { action: 'play' })
  await flushMediaLog()
  expect(batches).toEqual([])
})

it('sends at once at 20 entries, each with the run and its time, the browser once per batch', async () => {
  startMediaLog(null)
  for (let i = 0; i < FLUSH_AT - 1; i++) logMedia('action', { action: 'play', n: i })
  await vi.waitFor(() => expect(batches).toHaveLength(1))
  const [batch] = batches
  expect(batch!.source).toBe('media')
  expect(batch!.entries).toHaveLength(FLUSH_AT)
  const run = batch!.entries[0]!.run
  expect(run).toMatch(/^[0-9a-f]{12}$/)
  for (const e of batch!.entries) {
    expect(e.run).toBe(run)
    expect(e.t).toBeTypeOf('number')
  }
  expect(batch!.entries[0]).toMatchObject({ e: 'log-start', ua: navigator.userAgent })
  expect(batch!.entries.filter((e) => 'ua' in e)).toHaveLength(1)
})

it('otherwise sends every 5 s', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  startMediaLog(null)
  logMedia('loop', { ev: 'pause', paused: true, currentTime: 3.14159 })
  expect(batches).toEqual([])
  vi.advanceTimersByTime(FLUSH_MS)
  await vi.waitFor(() => expect(batches).toHaveLength(1))
  expect(batches[0]!.entries[1]).toMatchObject({ e: 'loop', ev: 'pause', paused: true, currentTime: 3.14 })
})

it('keeps strings short and drops what is not a field', async () => {
  startMediaLog(null)
  logMedia('action-failed', { message: 'x'.repeat(1000), nothing: undefined })
  await flushMediaLog()
  const entry = batches[0]!.entries[1]!
  expect(entry.message).toHaveLength(200)
  expect('nothing' in entry).toBe(false)
})

it('keeps entries the hub did not take, and sends them later', async () => {
  startMediaLog(null)
  logMedia('action', { action: 'play' })
  status = 503
  await flushMediaLog()
  expect(batches).toEqual([])
  status = 204
  await flushMediaLog()
  expect(batches[0]!.entries.map((e) => e.e)).toEqual(['log-start', 'action'])
  expect(batches[0]!.entries[0]!.ua).toBeTruthy()
})

it('a page put away is logged and sent at once; stopping sends what is left', async () => {
  startMediaLog(null)
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(batches).toHaveLength(1))
  expect(batches[0]!.entries[1]).toMatchObject({ e: 'visibility', state: 'hidden' })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  logMedia('action', { action: 'pause' })
  stopMediaLog()
  await vi.waitFor(() => expect(batches).toHaveLength(2))
  expect(batches[1]!.entries.map((e) => e.e)).toEqual(['action', 'log-stop'])
  logMedia('action', { action: 'play' }) // after the run: nothing
  await flushMediaLog()
  expect(batches).toHaveLength(2)
})
