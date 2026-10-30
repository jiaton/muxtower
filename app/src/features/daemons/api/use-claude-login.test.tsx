import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useLoginRunning, useLoginSession, useStartClaudeLogin } from './use-claude-login'

it('starts the login and returns its sign-in link', async () => {
  const url = 'https://claude.com/cai/oauth/authorize?code=true'
  server.use(http.post(`${DAEMON_URL}/v1/claude-login`, () => HttpResponse.json({ session: { id: 'l1' }, url }, { status: 201 })))
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useStartClaudeLogin(id), { wrapper: wrapper() })
  act(() => result.current.mutate())
  await waitFor(() => expect(result.current.data?.url).toBe(url))
})

it('types the code into the login session, Enter after it', async () => {
  let body: unknown
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/l1/input`, async ({ request }) => {
      body = await request.json()
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useLoginSession(id), { wrapper: wrapper() })
  act(() => result.current.sendCode.mutate({ sessionId: 'l1', code: 'abc#123' }))
  await waitFor(() => expect(result.current.sendCode.isSuccess).toBe(true))
  expect(body).toMatchObject({ text: 'abc#123', enter: true })
})

it('tells a login session that ended from one that runs', async () => {
  let gone = false
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/l1`, () =>
      gone ? HttpResponse.json({ detail: 'unknown session l1' }, { status: 404 }) : HttpResponse.json({ id: 'l1' }),
    ),
  )
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useLoginRunning(id, 'l1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current).toBe(true))
  gone = true
  await waitFor(() => expect(result.current).toBe(false), { timeout: 4000 })
})
