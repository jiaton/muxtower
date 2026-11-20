import { renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { UploadError, useUploadAttachment } from './use-upload-attachment'

const URL_ = `${DAEMON_URL}/v1/sessions/s1/attachments`
const file = new File(['hello, world'], 'launch plan (draft).txt', { type: 'text/plain' })

function upload() {
  const { id } = addDaemon()
  return renderHook(() => useUploadAttachment(id, 's1'), { wrapper: wrapper() }).result.current
}

it('sends the bytes as the body, the name percent-encoded, the type as the Content-Type, and gives the attachment', async () => {
  const seen: { name: string | null; type: string | null; body: string; auth: string | null }[] = []
  server.use(
    http.post(URL_, async ({ request }) => {
      seen.push({
        name: request.headers.get('X-Muxtower-Filename'),
        type: request.headers.get('Content-Type'),
        auth: request.headers.get('Authorization'),
        body: await request.text(),
      })
      return HttpResponse.json({ id: 'a1', name: 'launch plan (draft).txt', size: 12, media_type: 'text/plain', path: '/tmp/a1/x.txt' }, { status: 201 })
    }),
  )
  const progress: number[] = []
  const attachment = await upload()(file, (sent) => progress.push(sent))
  expect(attachment.id).toBe('a1')
  expect(seen).toEqual([{ name: 'launch%20plan%20(draft).txt', type: 'text/plain', auth: 'Bearer good', body: 'hello, world' }])
})

it('says why the daemon refused: over the limit (413), or its reason (409)', async () => {
  let status = 413
  server.use(
    http.post(URL_, () =>
      status === 413
        ? HttpResponse.json({ detail: 'larger than 25 MB' }, { status: 413 })
        : HttpResponse.json({ detail: 'this session takes pictures only' }, { status: 409 }),
    ),
  )
  const send = upload()
  await expect(send(file, () => {})).rejects.toMatchObject({ kind: 'refused', message: 'Too large: over 25 MB' })
  status = 409
  await expect(send(file, () => {})).rejects.toMatchObject({ kind: 'refused', message: 'this session takes pictures only' })
})

it('takes no answer (the network, or a proxy failing) as worth a retry', async () => {
  server.use(http.post(URL_, () => HttpResponse.error()))
  const send = upload()
  const failed = await send(file, () => {}).catch((e: unknown) => e)
  expect(failed).toBeInstanceOf(UploadError)
  expect(failed).toMatchObject({ kind: 'network', message: 'Upload failed' })
  server.use(http.post(URL_, () => new HttpResponse('bad gateway', { status: 502 })))
  await expect(send(file, () => {})).rejects.toMatchObject({ kind: 'network' })
})
