import 'fake-indexeddb/auto'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { useDaemonsStore } from '@/lib/daemons/store'
import { logPush, pushRecord, type PushLogRecord } from '@/lib/push-log'
import { DAEMON_URL, server } from '@/test/server'
import { postPushLog, pushLogEntry } from './report-push-log'

const SCOPE = 'https://app.example/push/hub/'
const record = (tag: string, at = 1_700_000_000_000): PushLogRecord =>
  pushRecord('show', { kind: 'done', ref: 'hub', session: tag.split(':')[1], tag, scope: SCOPE, version: '0.1.204' }, undefined, false, at)

afterEach(() => {
  useDaemonsStore.setState({ daemons: [] })
  localStorage.clear()
})

it('an entry keeps only the known fields, tags without trigger names, whatever the record held', () => {
  const tampered = {
    ...record('hub:s1'),
    title: 'Plan the launch',
    body: 'secret text',
    present: [{ tag: 'hub:trigger:deal-watch', at: 3, title: 'Plan the launch' }],
  } as unknown as PushLogRecord
  const entry = pushLogEntry(tampered)
  expect(Object.keys(entry).sort()).toEqual(
    ['asked', 'at', 'closed', 'event', 'held', 'keep_one', 'kind', 'origin', 'present', 'ref', 'scope', 'session', 'tag', 'version'],
  )
  expect(entry.present).toEqual([{ tag: 'hub:trigger', at: 3 }])
  expect(entry.at).toBe('2023-11-14T22:13:20.000Z')
  expect(JSON.stringify(entry)).not.toMatch(/Plan the launch|secret text|deal-watch/)
})

it('posts what is new to the daemon each push came from, as push-clear diagnostics, each record once', async () => {
  const bodies: { auth: string | null; body: { source: string; entries: { tag: string }[] } }[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/diagnostics`, async ({ request }) => {
      bodies.push({ auth: request.headers.get('authorization'), body: (await request.json()) as never })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  useDaemonsStore.setState({
    daemons: [
      { id: 'other', name: 'Other', url: 'http://other.test', token: 't0' },
      { id: 'hub', name: 'Hub', url: DAEMON_URL, token: 't1' },
    ],
  })
  await logPush(record('hub:s1'))
  await postPushLog()
  await logPush(record('hub:s2'))
  await postPushLog()
  await postPushLog()
  expect(bodies.map((b) => [b.auth, b.body.source, b.body.entries.map((e) => e.tag)])).toEqual([
    ['Bearer t1', 'push-clear', ['hub:s1']],
    ['Bearer t1', 'push-clear', ['hub:s2']],
  ])
})

it('a refused post keeps the records for the next try', async () => {
  let status = 500
  const got: number[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/diagnostics`, async ({ request }) => {
      got.push(((await request.json()) as { entries: unknown[] }).entries.length)
      return new HttpResponse(null, { status })
    }),
  )
  useDaemonsStore.setState({ daemons: [{ id: 'hub', name: 'Hub', url: DAEMON_URL, token: 't1' }] })
  await logPush(record('hub:s3'))
  await postPushLog()
  status = 204
  await postPushLog()
  expect(got.length).toBe(2)
  expect(got[1]).toBe(got[0])
})
