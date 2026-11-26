import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { FileItem } from '../hooks/use-files'
import { FileCards } from './file-cards'

afterEach(() => vi.restoreAllMocks())

const file = (name: string, type: string): FileItem => ({ key: name, file: new File(['x'], name, { type }), status: 'ready', sent: 1 })

it('shows a video the owner attaches as its first frame, from the file on the device, and plays it large', () => {
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:local-${++n}`)
  URL.revokeObjectURL = vi.fn()
  const items = [file('notes.pdf', 'application/pdf'), file('take-1.mp4', 'video/mp4'), file('take-2.webm', 'video/webm')]
  const { unmount } = render(<FileCards items={items} onRetry={() => {}} onRemove={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Play notes.pdf' })).toBeNull() // a document keeps its file icon
  const thumb = screen.getByRole('button', { name: 'Play take-2.webm' })
  expect(thumb.querySelector('video')?.getAttribute('src')).toMatch(/^blob:local-\d+#t=0\.1$/)
  fireEvent.click(thumb)
  expect(screen.getByText('2 / 2')).toBeInTheDocument() // the message's videos, one gallery
  expect((screen.getByLabelText('take-2.webm', { selector: 'video' }) as HTMLVideoElement).controls).toBe(true)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(screen.getByLabelText('take-1.mp4', { selector: 'video' })).toBeInTheDocument()
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(n) // every URL made is given back
})
