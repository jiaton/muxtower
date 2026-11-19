import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { http, HttpResponse } from 'msw'
import { DAEMON_URL, server } from '@/test/server'
import { firing, serveTriggers, START_MODES, TRIGGER } from '../test-daemon'
import { LOG_SIZE, useStartModes, useCreateTrigger, useDeleteTrigger, useFirings, useRotateSecret, useTestFire, useTriggers, useUpdateTrigger } from './use-triggers'

function hooks() {
  const daemon = addDaemon()
  const { result } = renderHook(
    () => ({
      list: useTriggers(daemon.id),
      log: useFirings(daemon.id, 'deals'),
      create: useCreateTrigger(daemon.id),
      update: useUpdateTrigger(daemon.id),
      remove: useDeleteTrigger(daemon.id),
      rotate: useRotateSecret(daemon.id),
      test: useTestFire(daemon.id),
    }),
    { wrapper: wrapper() },
  )
  return result
}

it('lists triggers, and the log newest first, at most LOG_SIZE', async () => {
  serveTriggers([TRIGGER], Array.from({ length: 60 }, (_, i) => firing(60 - i, 'delivered')))
  const r = hooks()
  await waitFor(() => expect(r.current.list.data).toEqual([TRIGGER]))
  await waitFor(() => expect(r.current.log.data).toHaveLength(LOG_SIZE))
  expect(r.current.log.data![0]!.id).toBe(1) // the most recent
})

it('creates, updates, rotates, tests and deletes through the daemon', async () => {
  const sent = serveTriggers()
  const r = hooks()
  await waitFor(() => expect(r.current.list.data).toBeDefined())
  let secret = ''
  await act(async () => {
    secret = (await r.current.create.mutateAsync({ name: 'x', enabled: true, action: { kind: 'notify' } })).secret
  })
  expect(secret).toBe('made-up-secret-1')
  await act(() => r.current.update.mutateAsync({ id: 'deals', patch: { enabled: false, clear_dedupe: false, clear_rate: false } }))
  await waitFor(() => expect(r.current.list.data?.[0]?.enabled).toBe(false))
  await act(async () => expect(await r.current.rotate.mutateAsync('deals')).toBe('made-up-secret-2'))
  await act(async () => expect((await r.current.test.mutateAsync({ id: 'deals', payload: { a: 1 } })).outcome).toBe('failed'))
  await act(() => r.current.remove.mutateAsync('deals'))
  expect(sent.map(([what]) => what)).toEqual(['POST /v1/triggers', 'PATCH deals', 'POST test', 'DELETE deals'])
})

it("reads the hub's start modes; a hub from before them has none", async () => {
  serveTriggers()
  const daemon = addDaemon()
  const { result } = renderHook(() => useStartModes(daemon.id), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toEqual(START_MODES))

  server.use(http.get(`${DAEMON_URL}/v1/triggers/start-modes`, () => HttpResponse.json({ detail: 'no trigger start-modes' }, { status: 404 })))
  const older = addDaemon()
  const { result: none } = renderHook(() => useStartModes(older.id), { wrapper: wrapper() })
  await waitFor(() => expect(none.current.data).toEqual([]))
})
