import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem, SharedFile } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { ConversationView } from './conversation-view'

const LATER = '2099-01-01T00:00:00Z'
const file = (id: string, name: string, media_type: string, expires_at = LATER): SharedFile => ({
  id,
  name,
  media_type,
  size: 48_000,
  caption: null,
  shared_at: '2026-11-26T07:30:00Z',
  expires_at,
})
const shared = (seq: number, f: SharedFile, text?: string) =>
  ({ seq, kind: 'shared', shared: f, text, images: [] }) as unknown as ConversationItem
const asked: string[] = []

beforeEach(() => {
  asked.length = 0
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:u${++n}`)
  URL.revokeObjectURL = vi.fn()
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/shared/:id`, ({ params }) => {
      asked.push(String(params.id))
      if (params.id === 'gone') return HttpResponse.json({ detail: 'no such shared file' }, { status: 404 })
      return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } })
    }),
  )
})

function show(items: ConversationItem[]) {
  const daemon = addDaemon()
  render(<ConversationView items={items} source={{ daemonId: daemon.id, sessionId: 's1' }} />, { wrapper: wrapper() })
}

it('shows a shared picture and video with their caption and time, in one gallery', async () => {
  show([
    shared(1, file('img', 'checklist.png', 'image/png'), 'The checklist, filled in'),
    shared(2, file('vid', 'flow.webm', 'video/webm')),
  ])
  expect(screen.getByText('The checklist, filled in')).toBeInTheDocument()
  expect(screen.getAllByText(/^Shared/)[0]!.querySelector('time')).toHaveAttribute('datetime', '2026-11-26T07:30:00Z')
  const play = await screen.findByRole('button', { name: 'Play flow.webm' })
  await screen.findByRole('img', { name: 'checklist.png' })
  fireEvent.click(play)
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  expect((screen.getByLabelText('flow.webm', { selector: 'video' }) as HTMLVideoElement).controls).toBe(true)
})

it('a PDF or any other file is a card that downloads it, never opening it', async () => {
  const names: string[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  show([shared(1, file('pdf', 'launch-plan.pdf', 'application/pdf'))])
  const card = screen.getByRole('group', { name: 'launch-plan.pdf' })
  expect(card).toHaveTextContent('48 KB')
  expect(asked).toEqual([]) // nothing fetched until asked
  fireEvent.click(within(card).getByRole('button', { name: 'Download launch-plan.pdf' }))
  await waitFor(() => expect(names).toEqual(['launch-plan.pdf']))
  expect(screen.queryByRole('dialog')).toBeNull()
  click.mockRestore()
})

it('an expired file says "Expired", with no thumbnail and no request', () => {
  show([
    shared(1, file('img', 'old.png', 'image/png', '2026-01-01T00:00:00Z')),
    shared(2, file('log', 'build.log', 'text/plain', '2026-01-01T00:00:00Z')),
  ])
  expect(screen.getAllByText('Expired')).toHaveLength(2)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
  expect(asked).toEqual([])
})

it('a file the daemon answers 404 for is expired too, for a picture and a download alike', async () => {
  show([shared(1, file('gone', 'shot.png', 'image/png')), shared(2, { ...file('gone', 'data.csv', 'text/csv'), id: 'gone' })])
  await waitFor(() => expect(screen.getAllByText('Expired')).toHaveLength(1)) // the picture, once its fetch is refused
  expect(screen.queryByRole('img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Download data.csv' }))
  await waitFor(() => expect(screen.getAllByText('Expired')).toHaveLength(2))
})
