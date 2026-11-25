import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useContinueCheck, useContinueInTerminal } from './use-continue'

function setup() {
  const daemon = addDaemon()
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { daemon, queryClient, wrapper }
}

it('reads whether a session can be continued in a terminal', async () => {
  const { daemon, wrapper } = setup()
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/cse_a/continue`, () =>
      HttpResponse.json({ step: 'blocked', reason: 'Its transcript is not on build-box', machine: 'build-box', session_id: null, retry: false }),
    ),
  )
  const { result } = renderHook(() => useContinueCheck(daemon.id, 'cse_a', false), { wrapper })
  await waitFor(() => expect(result.current.data?.reason).toBe('Its transcript is not on build-box'))
})

it('runs it, and the lists are read again', async () => {
  const { daemon, queryClient, wrapper } = setup()
  queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), [])
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/cse_a/continue`, () =>
      HttpResponse.json({ step: 'done', reason: null, machine: 'build-box', session_id: 'p1', retry: false }),
    ),
  )
  const { result } = renderHook(() => useContinueInTerminal(daemon.id, 'cse_a'), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.data?.session_id).toBe('p1'))
  expect(queryClient.getQueryState(daemonKey(daemon.id, 'sessions'))?.isInvalidated).toBe(true)
})
