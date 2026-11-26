import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ConversationItem } from '@/lib/api/types'
import { wrapper } from '@/test/render'
import { ConversationView } from './conversation-view'

vi.mock('../api/use-session-image', () => ({
  useSessionImage: (_d: string, _s: string, path: string) => ({ data: new Blob([path]), isError: false }),
}))
URL.createObjectURL = (b: Blob) => `blob:${(b as Blob & { size: number }).size}`
URL.revokeObjectURL = () => {}

const item = (seq: number, images: string[]): ConversationItem =>
  ({ seq, kind: 'prompt', text: `message ${seq}`, images }) as unknown as ConversationItem

it('opens any image of the conversation in one gallery of all of them, in order', () => {
  const items = [item(1, ['/tmp/a.png']), item(2, ['/tmp/b.png', '/tmp/c.png']), item(3, ['/tmp/a.png'])]
  render(<ConversationView items={items} source={{ daemonId: 'd1', sessionId: 's1' }} />, { wrapper: wrapper() })
  fireEvent.click(screen.getAllByRole('button', { name: 'b.png' })[0]!)
  expect(screen.getByText('2 / 3')).toBeInTheDocument() // a, b, c: each once, as first shown
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
  expect(screen.getByRole('dialog')).toHaveTextContent('c.png')
})

it('shows a video as its first frame with a play mark, and plays it in the same gallery', () => {
  const items = [item(1, ['/tmp/a.png']), item(2, ['/tmp/demo.webm'])]
  render(<ConversationView items={items} source={{ daemonId: 'd1', sessionId: 's1' }} />, { wrapper: wrapper() })
  const thumb = screen.getByRole('button', { name: 'Play demo.webm' })
  expect(thumb.querySelector('video')?.controls).toBe(false) // a still, not a player
  fireEvent.click(thumb)
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  const player = screen.getByLabelText('demo.webm', { selector: 'video' }) as HTMLVideoElement
  expect(player.controls).toBe(true)
  expect(player.autoplay).toBe(false)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument()
})
