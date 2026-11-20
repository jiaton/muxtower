import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAttachPickers } from '@/lib/attach-picker'
import type { Attachment } from '@/lib/api/types'
import { UploadError } from '../api/use-upload-attachment'
import { useDrafts } from '../store'
import { InputBar } from './input-bar'

const mutate = vi.fn((_body: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => options?.onSuccess?.())
vi.mock('../api/use-terminal', () => ({
  useSendInput: () => ({ mutate, isPending: false, isError: false }),
  useAcceptSuggestion: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn(), isError: false, error: null }),
}))
// Each upload waits until the test answers it.
type Upload = { file: File; progress: (sent: number, total: number) => void; ok: (a: Attachment) => void; fail: (e: unknown) => void }
const uploads: Upload[] = []
vi.mock('../api/use-upload-attachment', async (actual) => ({
  ...(await actual<typeof import('../api/use-upload-attachment')>()),
  useUploadAttachment: () => (file: File, progress: Upload['progress']) =>
    new Promise<Attachment>((ok, fail) => uploads.push({ file, progress, ok, fail })),
}))

beforeEach(() => {
  mutate.mockClear()
  uploads.length = 0
  useDrafts.setState({ drafts: {}, quotes: {}, filled: {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })) // a desktop
})
afterEach(() => vi.unstubAllGlobals())

const box = () => screen.getByRole('textbox', { name: 'Message the agent' })
const chip = (name: RegExp) => within(screen.getByRole('list', { name: 'Files' })).getByRole('group', { name })
const made = (name: string, size = 200, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })
const attachment = (id: string, name: string): Attachment => ({ id, name, size: 200, media_type: 'application/pdf', path: `/tmp/${id}/${name}` })
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function paste(...files: File[]) {
  await act(async () => {
    fireEvent.paste(box(), { clipboardData: { files } })
  })
}

it('uploads a file at once: its chip shows the progress, becomes ready, and goes by id with the words', async () => {
  render(<InputBar daemonId="nas" sessionId="s1" images />)
  await paste(made('launch-plan.pdf'))
  expect(uploads).toHaveLength(1)
  expect(chip(/launch-plan\.pdf, uploading, 0%/)).toBeTruthy()
  act(() => uploads[0]!.progress(100, 200))
  expect(screen.getByRole('progressbar', { name: 'Uploading launch-plan.pdf' })).toHaveAttribute('aria-valuenow', '50')
  expect(screen.getByRole('button', { name: 'Uploading…' })).toHaveTextContent('Uploading…')
  await act(async () => uploads[0]!.ok(attachment('a1', 'launch-plan.pdf')))
  expect(chip(/launch-plan\.pdf, 200 B/)).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
  fireEvent.change(box(), { target: { value: 'read this' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))
  await vi.waitFor(() => expect(mutate).toHaveBeenCalled())
  expect(mutate.mock.calls[0]![0]).toEqual({ text: 'read this', enter: true, images: [], attachments: ['a1'] })
  expect(screen.queryByRole('list', { name: 'Files' })).toBeNull() // sent: the chips clear
  expect(box()).toHaveValue('')
})

it('Send waits for uploads still on their way, then sends with them', async () => {
  render(<InputBar daemonId="nas" sessionId="s1" />)
  fireEvent.change(box(), { target: { value: 'both logs' } })
  await paste(made('server.log', 300, 'text/plain'), made('client.log', 300, 'text/plain'))
  await act(async () => uploads[0]!.ok(attachment('a1', 'server.log')))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Uploading…' })))
  expect(mutate).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Uploading…, sends when done' })).toBeTruthy()
  await act(async () => uploads[1]!.ok(attachment('a2', 'client.log')))
  await settle()
  await vi.waitFor(() => expect(mutate).toHaveBeenCalledOnce())
  expect(mutate.mock.calls[0]![0]).toMatchObject({ text: 'both logs', attachments: ['a1', 'a2'] })
})

it('says why an upload failed on its chip; one that got no answer can be retried; none holds back the rest', async () => {
  render(<InputBar daemonId="nas" sessionId="s1" />)
  await paste(made('dump.bin'), made('notes.txt'), made('report.pdf'))
  await act(async () => uploads[0]!.fail(new UploadError('refused', 'Too large: over 25 MB')))
  await act(async () => uploads[1]!.fail(new UploadError('network', 'Upload failed')))
  await act(async () => uploads[2]!.ok(attachment('a3', 'report.pdf')))
  expect(within(chip(/dump\.bin/)).getByText('Too large: over 25 MB')).toBeTruthy()
  expect(within(chip(/dump\.bin/)).queryByRole('button', { name: 'Retry' })).toBeNull() // retrying would not help
  expect(chip(/notes\.txt/)).toHaveTextContent('Upload failed·Retry')
  fireEvent.click(within(chip(/notes\.txt/)).getByRole('button', { name: 'Retry' }))
  expect(uploads).toHaveLength(4) // tried again
  expect(chip(/notes\.txt, uploading/)).toBeTruthy()
  await act(async () => uploads[3]!.fail(new UploadError('refused', 'this session takes pictures only')))
  expect(within(chip(/notes\.txt/)).getByText('this session takes pictures only')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove dump.bin' }))
  expect(screen.queryByRole('group', { name: /dump\.bin/ })).toBeNull()
  // The failed one is no reason to wait: Send sends what is ready.
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))
  await vi.waitFor(() => expect(mutate).toHaveBeenCalled())
  expect(mutate.mock.calls[0]![0]).toMatchObject({ text: '', attachments: ['a3'] })
})

it('takes up to as many files as pictures, and says how many it took', async () => {
  render(<InputBar daemonId="nas" sessionId="s1" />)
  await paste(...['a', 'b', 'c', 'd', 'e', 'f'].map((n) => made(`${n}.csv`, 10, 'text/csv')))
  expect(uploads).toHaveLength(4)
  expect(screen.getByText('Up to 4 files in a message: added 4 of 6.')).toBeTruthy()
})

it('sends a picture as a file where the session takes no pictures', async () => {
  render(<InputBar daemonId="nas" sessionId="s1" />)
  await paste(made('screenshot.png', 50, 'image/png'))
  expect(uploads.map((u) => u.file.name)).toEqual(['screenshot.png'])
  expect(screen.queryByRole('list', { name: 'Pictures' })).toBeNull()
})

it('gives ⌘K its picker while it shows', () => {
  const { unmount } = render(<InputBar daemonId="nas" sessionId="s1" />)
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  useAttachPickers.getState().pickers['nas/s1']!()
  expect(click).toHaveBeenCalled()
  expect((click.mock.contexts[0] as HTMLInputElement).accept).toBe('')
  unmount()
  expect(useAttachPickers.getState().pickers['nas/s1']).toBeUndefined()
})
