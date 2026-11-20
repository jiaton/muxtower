import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FileChip } from './file-chip'

const NAME = 'quarterly-report-final-v2.pdf'
const parts = { name: NAME, head: 'quarterly-report-fi', tail: 'nal-v2.pdf', size: '1.2 MB' }

it('shows the name cut in the middle (its end kept whole), the size, and a remove', () => {
  const onRemove = vi.fn()
  render(<FileChip {...parts} status="ready" onRemove={onRemove} />)
  const chip = screen.getByRole('group', { name: `${NAME}, 1.2 MB` })
  expect(chip).toHaveTextContent('quarterly-report-final-v2.pdf1.2 MB')
  expect(screen.getByText('nal-v2.pdf')).toHaveClass('shrink-0') // never cut
  expect(screen.getByText('quarterly-report-fi')).toHaveClass('truncate')
  fireEvent.click(screen.getByRole('button', { name: `Remove ${NAME}` }))
  expect(onRemove).toHaveBeenCalledOnce()
})

it('fills a bar while uploading, and says why it failed, with Retry when given', () => {
  const { rerender } = render(<FileChip {...parts} status="uploading" progress={0.42} onRemove={() => {}} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  expect(screen.getByRole('group')).toHaveTextContent('1.2 MB · 42%')
  const onRetry = vi.fn()
  rerender(<FileChip {...parts} status="error" error="Upload failed" onRetry={onRetry} onRemove={() => {}} />)
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByRole('group', { name: `${NAME}, Upload failed` })).toHaveAttribute('data-status', 'error')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalledOnce()
  rerender(<FileChip {...parts} status="error" error="Too large: over 25 MB" onRemove={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})
