import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useArchiveSession } from './use-session-mutations'

it('archives a session on its daemon and reloads the list', async () => {
  const daemon = addDaemon()
  let archived = false
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/archive`, () => {
      archived = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const queryClient = new QueryClient()
  queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), [{ id: 's1' } as Session])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useArchiveSession(daemon.id, 's1'), { wrapper })

  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(archived).toBe(true)
  expect(queryClient.getQueryState(daemonKey(daemon.id, 'sessions'))?.isInvalidated).toBe(true)
})
