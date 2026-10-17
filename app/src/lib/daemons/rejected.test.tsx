import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { useDaemonSessions } from '@/features/sessions/api/use-sessions'
import { queryClient } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useDaemonsStore } from './store'

it('a 401 marks the daemon rejected, and re-pairing clears it', async () => {
  server.use(http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json({ detail: 'nope' }, { status: 401 })))
  const { id } = addDaemon('revoked')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  renderHook(() => useDaemonSessions(id), { wrapper })
  await waitFor(() => expect(useDaemonsStore.getState().daemons[0].rejected).toBe(true))
  useDaemonsStore.getState().add({ name: 'box', url: DAEMON_URL, token: 'fresh' })
  expect(useDaemonsStore.getState().daemons[0].rejected).toBe(false)
})
