import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useApprove } from './use-approval'

it('posts the chosen option and surfaces a 409 as an error', async () => {
  const bodies: unknown[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/approve`, async ({ request }) => {
      bodies.push(await request.json())
      return bodies.length === 1
        ? HttpResponse.json({ session_id: 's1', state: 'needs_permission', option: '2' })
        : HttpResponse.json({ detail: 'the dialog is not on screen yet' }, { status: 409 })
    }),
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])),
  )
  const { id } = addDaemon()
  const { result } = renderHook(() => useApprove(id, 's1'), { wrapper: wrapper() })
  await act(() => result.current.mutateAsync('2'))
  expect(bodies[0]).toEqual({ option: '2' })
  await act(async () => {
    await result.current.mutateAsync(undefined).catch(() => undefined)
  })
  await waitFor(() => expect(result.current.error?.message).toBe('the dialog is not on screen yet'))
})
