import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useJoinCode, useRemoveNode } from './use-nodes'

it('removes a node on its daemon', async () => {
  const removed: string[] = []
  server.use(
    http.delete(`${DAEMON_URL}/v1/nodes/:name`, ({ params }) => {
      removed.push(String(params.name))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useRemoveNode(id), { wrapper: wrapper() })
  result.current.mutate('mac')
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(removed).toEqual(['mac'])
})

it('makes a one-time code for a computer to join with', async () => {
  server.use(http.post(`${DAEMON_URL}/v1/pair/codes`, () => HttpResponse.json({ code: 'K7QM-3XPA', expires_at: '2026-10-27T01:05:00Z' })))
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useJoinCode(id), { wrapper: wrapper() })
  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.code).toBe('K7QM-3XPA')
})
