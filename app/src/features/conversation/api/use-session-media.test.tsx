import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useSessionMedia, useUnshownMedia } from './use-session-media'

it('fetches a file by its path as written and an inline image by item and place; tells which cannot show', async () => {
  const daemon = addDaemon()
  const asked: string[] = []
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/media`, ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')!
      asked.push(path)
      return path === 'gone.png' ? HttpResponse.json({ detail: 'deleted since' }, { status: 410 }) : new HttpResponse(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
    }),
    http.get(`${DAEMON_URL}/v1/sessions/s1/items/:seq/media/:index`, ({ params }) => {
      asked.push(`${String(params.seq)}/${String(params.index)}`)
      return new HttpResponse(new Uint8Array([2]), { headers: { 'content-type': 'image/png' } })
    }),
  )
  const { result } = renderHook(
    () => ({
      file: useSessionMedia(daemon.id, 's1', { from: 'file', path: '~/a b.png' }),
      inline: useSessionMedia(daemon.id, 's1', { from: 'inline', seq: 7, index: 1 }),
      gone: useSessionMedia(daemon.id, 's1', { from: 'file', path: 'gone.png' }),
      none: useSessionMedia(daemon.id, 's1', undefined),
      unshown: useUnshownMedia(daemon.id, 's1'),
    }),
    { wrapper: wrapper() },
  )
  await waitFor(() => expect(result.current.file.data).toBeInstanceOf(Blob))
  await waitFor(() => expect(result.current.inline.data).toBeInstanceOf(Blob))
  await waitFor(() => expect([...result.current.unshown]).toEqual(['file:gone.png']))
  expect(result.current.none.fetchStatus).toBe('idle')
  expect(asked.sort()).toEqual(['7/1', '~/a b.png', 'gone.png'].sort())
})
