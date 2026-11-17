import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { useDaemonsStore } from '@/lib/daemons/store'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useDaemonsNeedALook } from './use-daemons-need-a-look'

const node = (name: string, update: string | null) => ({ name, online: true, version: '0.1.150', update })

it('nothing to look at: no dot', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([node('mac', null)])),
  )
  addDaemon()
  const { result } = renderHook(() => useDaemonsNeedALook(), { wrapper: wrapper() })
  await new Promise((r) => setTimeout(r, 50))
  expect(result.current).toBeNull()
})

it('a node with an update waiting wants a look', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([node('mac', '0.1.151')])),
  )
  addDaemon()
  const { result } = renderHook(() => useDaemonsNeedALook(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current).toBe('mac: an update is waiting'))
})

it('a daemon that no longer accepts this device wants a look', async () => {
  server.use(http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])))
  const daemon = addDaemon()
  useDaemonsStore.getState().update(daemon.id, { rejected: true })
  const { result } = renderHook(() => useDaemonsNeedALook(), { wrapper: wrapper() })
  expect(result.current).toBe('box no longer accepts this device')
})
