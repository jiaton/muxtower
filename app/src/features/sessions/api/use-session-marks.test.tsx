import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useHideSession, useMarkRead } from './use-session-marks'

it('tells the daemon and shows the session read at once', async () => {
  const daemon = addDaemon()
  const bodies: unknown[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/read`, async ({ request }) => {
      bodies.push(await request.json())
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const queryClient = new QueryClient()
  queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), [{ id: 's1', unread: true } as Session])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useMarkRead(), { wrapper })

  result.current.mutate({ daemonId: daemon.id, sessionId: 's1', read: true })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(bodies).toEqual([{ read: true }])
  expect(queryClient.getQueryData<Session[]>(daemonKey(daemon.id, 'sessions'))?.[0].unread).toBe(false)
})

it('hides a session on its daemon and in the list at once', async () => {
  const daemon = addDaemon()
  const bodies: unknown[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/hide`, async ({ request }) => {
      bodies.push(await request.json())
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const queryClient = new QueryClient()
  queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), [{ id: 's1', hidden: false } as Session])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useHideSession(), { wrapper })

  result.current.mutate({ daemonId: daemon.id, sessionId: 's1', hidden: true })
  expect(queryClient.getQueryData<Session[]>(daemonKey(daemon.id, 'sessions'))?.[0].hidden).toBe(true)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(bodies).toEqual([{ hidden: true }])
})
