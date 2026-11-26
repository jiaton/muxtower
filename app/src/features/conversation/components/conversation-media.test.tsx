import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem, MediaRef } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { ConversationView } from './conversation-view'

// An item's media at the HTTP boundary: a file by its path as written (`/media?path=`), an image inside a
// tool's result by its item and place, and what the daemon answers when one cannot show. Made-up paths only.

const reply = (seq: number, media: MediaRef[], images: string[] = []) =>
  ({ seq, kind: 'reply', text: `Reply ${seq}`, images, media }) as unknown as ConversationItem
const file = (path: string, kind: 'image' | 'video' = 'image'): MediaRef => ({ source: 'file', kind, path })
const inline = (index: number): MediaRef => ({ source: 'inline', kind: 'image', index, media_type: 'image/png' })

/** The status each path answers (200 when not named), and every request, as "path" or "seq/index". */
let status: Record<string, number> = {}
const asked: string[] = []
const answer = (key: string) => {
  asked.push(key)
  const code = status[key] ?? 200
  return code === 200
    ? new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'content-type': key.endsWith('.webm') ? 'video/webm' : 'image/png' } })
    : HttpResponse.json({ detail: 'no' }, { status: code })
}

beforeEach(() => {
  status = {}
  asked.length = 0
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:u${++n}`)
  URL.revokeObjectURL = vi.fn()
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/media`, ({ request }) => answer(new URL(request.url).searchParams.get('path') ?? '')),
    http.get(`${DAEMON_URL}/v1/sessions/s1/items/:seq/media/:index`, ({ params }) => answer(`${String(params.seq)}/${String(params.index)}`)),
    http.get(`${DAEMON_URL}/v1/sessions/s1/image`, ({ request }) => answer(`old:${new URL(request.url).searchParams.get('path') ?? ''}`)),
  )
})

function show(items: ConversationItem[]) {
  const daemon = addDaemon()
  return render(<ConversationView items={items} source={{ daemonId: daemon.id, sessionId: 's1' }} />, { wrapper: wrapper() })
}

it('shows a file by its path as written, an inline image and a video under their item, in one gallery', async () => {
  show([reply(3, [file('~/shots/home.png'), inline(0)]), reply(4, [file('demo/flow.webm', 'video')])])
  expect(await screen.findByRole('img', { name: 'home.png' })).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: "Image 1 of a tool's result" })).toBeInTheDocument()
  const play = await screen.findByRole('button', { name: 'Play flow.webm' })
  expect(play).toHaveTextContent('flow.webmVideo')
  expect(asked.sort()).toEqual(['3/0', '~/shots/home.png']) // a video loads only when opened
  fireEvent.click(play)
  expect(screen.getByText('3 / 3')).toBeInTheDocument()
  expect(await screen.findByLabelText('flow.webm', { selector: 'video' })).toBeInTheDocument()
  expect(asked).toContain('demo/flow.webm')
})

it('says a file deleted since or too large quietly, leaves out what is not media, and counts only what shows', async () => {
  status = { 'gone.png': 410, 'huge.png': 413, 'notes.png': 415 }
  show([reply(1, [file('ok.png'), file('gone.png'), file('huge.png'), file('notes.png'), file('also-ok.png')])])
  expect(await screen.findByText('File no longer there')).toBeInTheDocument()
  expect(await screen.findByText('Too large to show')).toBeInTheDocument()
  await waitFor(() => expect(asked).toContain('notes.png'))
  expect(screen.queryByText(/notes\.png/)).toBeNull() // not an image by its content: nothing at all
  await screen.findByRole('img', { name: 'also-ok.png' })
  fireEvent.click(await screen.findByRole('img', { name: 'ok.png' }))
  expect(screen.getByText('1 / 2')).toBeInTheDocument() // of five: the other three cannot show
})

it('says why a video cannot show once it is opened, in the viewer and on its tile, and counts it until then', async () => {
  status = { 'huge.mp4': 413 }
  show([reply(1, [file('a.png'), file('huge.mp4', 'video')])])
  await screen.findByRole('img', { name: 'a.png' })
  fireEvent.click(await screen.findByRole('button', { name: 'Play huge.mp4' }))
  expect(screen.getByText('2 / 2')).toBeInTheDocument() // counted until it failed
  expect(await screen.findAllByText('Too large to show')).not.toHaveLength(0)
})

it('offers to try again when the machine cannot be reached, and shows it once it can', async () => {
  status = { 'away.png': 409 }
  show([reply(1, [file('away.png')])])
  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(screen.getByText("Its machine can't be reached")).toBeInTheDocument()
  status = {}
  fireEvent.click(retry)
  expect(await screen.findByRole('img', { name: 'away.png' })).toBeInTheDocument()
})

it('shows nothing for a file the daemon does not show (404)', async () => {
  status = { 'elsewhere.png': 404 }
  show([reply(1, [file('elsewhere.png')])])
  await waitFor(() => expect(asked).toEqual(['elsewhere.png']))
  await waitFor(() => expect(screen.queryByText(/elsewhere|no longer|not available/)).toBeNull())
})

it("shows an older daemon's images by path when an item has no media", async () => {
  show([reply(1, [], ['/tmp/old.png'])])
  expect(await screen.findByRole('img', { name: 'old.png' })).toBeInTheDocument()
  expect(asked).toEqual(['old:/tmp/old.png'])
})
