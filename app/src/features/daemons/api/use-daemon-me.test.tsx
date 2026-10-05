import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { beforeEach, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { DAEMON_URL, server } from '@/test/server'
import { useDaemonsStore } from '../store'
import { useDaemonMe } from './use-daemon-me'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => useDaemonsStore.setState({ daemons: [] }))

it('sends the bearer token and returns the token name', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/me`, ({ request }) =>
      request.headers.get('authorization') === 'Bearer good'
        ? HttpResponse.json({ token_name: 'phone', daemon_name: 'box' })
        : HttpResponse.json({ detail: 'missing or invalid bearer token' }, { status: 401 }),
    ),
  )
  const { id } = useDaemonsStore.getState().add({ name: 'box', url: DAEMON_URL, token: 'good' })
  const { result } = renderHook(() => useDaemonMe(id), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.token_name).toBe('phone')
})

it('surfaces a rejected token as a 401 ApiError', async () => {
  server.use(http.get(`${DAEMON_URL}/v1/me`, () => HttpResponse.json({ detail: 'nope' }, { status: 401 })))
  const { id } = useDaemonsStore.getState().add({ name: 'box', url: DAEMON_URL, token: 'bad' })
  const { result } = renderHook(() => useDaemonMe(id), { wrapper })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect((result.current.error as ApiError).status).toBe(401)
})
