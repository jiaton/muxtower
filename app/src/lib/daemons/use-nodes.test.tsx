import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useNodes } from './use-nodes'

it('lists the computers joined to a daemon', async () => {
  const node = { name: 'mac', online: true, joined_at: '2026-10-27T01:00:00Z', sessions: 2, runtimes: [] }
  server.use(http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([node])))
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useNodes(id), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.map((n) => [n.name, n.online])).toEqual([['mac', true]])
})
