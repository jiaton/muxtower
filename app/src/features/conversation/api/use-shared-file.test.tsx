import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import type { SharedFile } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { isGone, useDownloadShared, useSharedFile } from './use-shared-file'

const file = (id: string, name: string, media_type: string): SharedFile => ({
  id,
  name,
  media_type,
  size: 4,
  caption: null,
  shared_at: '2026-11-26T07:30:00Z',
  expires_at: '2099-01-01T00:00:00Z',
})

function serve() {
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/shared/:id`, ({ params }) =>
      params.id === 'f1'
        ? new HttpResponse(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'video/webm' } })
        : HttpResponse.json({ detail: 'no such shared file' }, { status: 404 }),
    ),
  )
}

it('fetches a shared file as a blob; one the daemon no longer has is gone', async () => {
  const daemon = addDaemon()
  serve()
  const shown = renderHook(() => useSharedFile(daemon.id, 's1', file('f1', 'clip.webm', 'video/webm')), { wrapper: wrapper() })
  await waitFor(() => expect(shown.result.current.data?.size).toBe(4))
  expect(shown.result.current.data?.type).toBe('video/webm')

  const old = renderHook(() => useSharedFile(daemon.id, 's1', file('f9', 'old.png', 'image/png')), { wrapper: wrapper() })
  await waitFor(() => expect(old.result.current.isError).toBe(true))
  expect(isGone(old.result.current.error)).toBe(true)
})

it('asks for nothing without a file', () => {
  const daemon = addDaemon()
  const none = renderHook(() => useSharedFile(daemon.id, 's1', undefined), { wrapper: wrapper() })
  expect(none.result.current.fetchStatus).toBe('idle')
})

it('downloads a shared file under its name, as a download of no renderable type', async () => {
  const daemon = addDaemon()
  serve()
  let saved: Blob | undefined
  URL.createObjectURL = vi.fn((b: Blob) => ((saved = b), 'blob:x'))
  URL.revokeObjectURL = vi.fn()
  const names: string[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  const { result } = renderHook(() => useDownloadShared(daemon.id, 's1'), { wrapper: wrapper() })
  await act(() => result.current.mutateAsync(file('f1', 'report.pdf', 'application/pdf')))
  expect(names).toEqual(['report.pdf'])
  expect(saved?.type).toBe('application/octet-stream')
  await act(() => result.current.mutateAsync(file('f9', 'gone.log', 'text/plain')).catch(() => {}))
  expect(isGone(result.current.error)).toBe(true)
  click.mockRestore()
})
