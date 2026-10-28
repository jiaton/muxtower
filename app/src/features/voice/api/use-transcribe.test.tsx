import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useTranscribe } from './use-transcribe'

it('sends the recording as it is, typed by its format, and returns the words', async () => {
  let seen: { type: string | null; size: number } | undefined
  server.use(
    http.post(`${DAEMON_URL}/v1/asr`, async ({ request }) => {
      seen = { type: request.headers.get('content-type'), size: (await request.arrayBuffer()).byteLength }
      return HttpResponse.json({ text: ' 继续，然后跑测试 ' })
    }),
  )
  const { id } = addDaemon('good')
  const { result } = renderHook(() => useTranscribe(id), { wrapper: wrapper() })
  let text = ''
  await act(async () => {
    text = await result.current.mutateAsync(new Blob([new Uint8Array(1200)], { type: 'audio/webm;codecs=opus' }))
  })
  expect(text).toBe('继续，然后跑测试')
  await waitFor(() => expect(seen).toEqual({ type: 'audio/webm', size: 1200 }))
})
