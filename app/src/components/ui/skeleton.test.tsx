import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Loading, SHOW_AFTER_MS, Skeleton } from './skeleton'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('shows nothing for a quick load, then the skeleton; says loading to screen readers at once', () => {
  render(
    <Loading label="Loading sessions…">
      <Skeleton className="w-10" />
    </Loading>,
  )
  expect(screen.getByRole('status')).toHaveTextContent('Loading sessions…')
  expect(document.querySelector('.motion-safe\\:animate-pulse')).toBeNull()
  act(() => vi.advanceTimersByTime(SHOW_AFTER_MS))
  expect(document.querySelector('.motion-safe\\:animate-pulse')).not.toBeNull() // pulses only where motion is welcome
})

it('without a skeleton, one quiet line', () => {
  render(<Loading />)
  act(() => vi.advanceTimersByTime(SHOW_AFTER_MS))
  expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
})
