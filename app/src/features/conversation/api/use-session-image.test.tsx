import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useSessionImage } from './use-session-image'

it('fetches an image the conversation shows, as a blob, and fails for one it does not', async () => {
  const daemon = addDaemon()
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/image`, ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path !== '/srv/shot.png') return HttpResponse.json({ detail: 'the conversation shows no such image' }, { status: 404 })
      return new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
    }),
  )
  const shown = renderHook(() => useSessionImage(daemon.id, 's1', '/srv/shot.png'), { wrapper: wrapper() })
  await waitFor(() => expect(shown.result.current.data).toBeDefined())
  expect(shown.result.current.data?.type).toBe('image/png')
  expect(shown.result.current.data?.size).toBe(4)

  const other = renderHook(() => useSessionImage(daemon.id, 's1', '/etc/passwd'), { wrapper: wrapper() })
  await waitFor(() => expect(other.result.current.isError).toBe(true))
  expect(other.result.current.error?.message).toBe('the conversation shows no such image')
})
