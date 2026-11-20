import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useProjectOrder, useSaveProjectOrder } from './use-project-order'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

it('reads the order from the first daemon (the hub)', async () => {
  addDaemon()
  server.use(http.get(`${DAEMON_URL}/v1/project-order`, () => HttpResponse.json({ projects: ['acme/api', 'acme/web'] })))
  const { result } = renderHook(() => useProjectOrder(), { wrapper: wrap(new QueryClient()) })
  await waitFor(() => expect(result.current).toEqual(['acme/api', 'acme/web']))
})

it('has no order from a daemon too old to keep one', async () => {
  addDaemon()
  server.use(http.get(`${DAEMON_URL}/v1/project-order`, () => new HttpResponse(null, { status: 404 })))
  const { result } = renderHook(() => useProjectOrder(), { wrapper: wrap(new QueryClient()) })
  await new Promise((r) => setTimeout(r, 20))
  expect(result.current).toEqual([])
})

it('puts the whole order, shown at once, and puts it back when refused', async () => {
  const daemon = addDaemon()
  const bodies: unknown[] = []
  let refuse = false
  server.use(
    http.put(`${DAEMON_URL}/v1/project-order`, async ({ request }) => {
      bodies.push(await request.json())
      return refuse ? new HttpResponse(null, { status: 502 }) : HttpResponse.json(bodies.at(-1) as object)
    }),
  )
  const client = new QueryClient()
  const key = daemonKey(daemon.id, 'project-order')
  client.setQueryData(key, ['acme/web', 'acme/api'])
  const { result } = renderHook(() => useSaveProjectOrder(), { wrapper: wrap(client) })

  result.current.mutate(['acme/api', 'acme/web'])
  await waitFor(() => expect(client.getQueryData(key)).toEqual(['acme/api', 'acme/web']))
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(bodies).toEqual([{ projects: ['acme/api', 'acme/web'] }])

  refuse = true
  result.current.mutate(['acme/web', 'acme/api'])
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(client.getQueryData(key)).toEqual(['acme/api', 'acme/web'])
})
