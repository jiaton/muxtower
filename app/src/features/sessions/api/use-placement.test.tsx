import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useDetectPlacement, usePlaceSession } from './use-placement'

function setup() {
  const daemon = addDaemon()
  const queryClient = new QueryClient()
  queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), [{ id: 's1', machine: null, cwd: '' } as Session])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { daemon, queryClient, wrapper }
}

it('places a session and shows it there', async () => {
  const { daemon, queryClient, wrapper } = setup()
  const bodies: unknown[] = []
  server.use(
    http.put(`${DAEMON_URL}/v1/sessions/s1/placement`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ id: 's1', machine: 'Laptop', cwd: '' })
    }),
  )
  const { result } = renderHook(() => usePlaceSession(daemon.id, 's1'), { wrapper })
  result.current.mutate({ machine: 'Laptop', folder: null })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(bodies).toEqual([{ machine: 'Laptop', folder: null }])
  expect(queryClient.getQueryData<Session[]>(daemonKey(daemon.id, 'sessions'))?.[0].machine).toBe('Laptop')
})

it('suggests the folder the log names, or says it names none, keeping nothing', async () => {
  const { daemon, queryClient, wrapper } = setup()
  let folder: string | null = '/Users/me/jobs'
  server.use(http.post(`${DAEMON_URL}/v1/sessions/s1/placement/detect`, () => HttpResponse.json({ folder })))
  const { result } = renderHook(() => useDetectPlacement(daemon.id, 's1'), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.data).toEqual({ folder: '/Users/me/jobs' }))
  expect(queryClient.getQueryData<Session[]>(daemonKey(daemon.id, 'sessions'))?.[0].cwd).toBe('') // not placed

  folder = null
  result.current.mutate()
  await waitFor(() => expect(result.current.data).toEqual({ folder: null }))
})
