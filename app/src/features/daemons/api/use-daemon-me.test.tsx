import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useDaemonMe } from './use-daemon-me'

it('sends the bearer token and returns the token name', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/me`, ({ request }) =>
      request.headers.get('authorization') === 'Bearer good'
        ? HttpResponse.json({ token_name: 'phone', daemon_name: 'box' })
        : HttpResponse.json({ detail: 'missing or invalid bearer token' }, { status: 401, headers: { 'X-Muxtower-Auth': 'x' } }),
    ),
  )
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useDaemonMe(id), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.token_name).toBe('phone')
})

it('surfaces a rejected token as a 401 ApiError', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/me`, () => HttpResponse.json({ detail: 'nope' }, { status: 401, headers: { 'X-Muxtower-Auth': 'x' } })),
  )
  const { id } = addDaemon('bad')
  const { result } = renderHook(() => useDaemonMe(id), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect((result.current.error as ApiError).status).toBe(401)
})

it('does not call an unpaired daemon at all', () => {
  const { id } = addDaemon(null)
  const { result } = renderHook(() => useDaemonMe(id), { wrapper: wrapper() })
  expect(result.current.fetchStatus).toBe('idle')
})
