import type { UseQueryResult } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryState } from './query-state'
import { SHOW_AFTER_MS } from './ui/skeleton'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const query = (over: Partial<UseQueryResult<string>>) =>
  ({
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
    isFetching: false,
    data: 'x',
    refetch: vi.fn(),
    ...over,
  }) as UseQueryResult<string>

it("loading: the caller's skeleton, after a moment", () => {
  render(
    <QueryState query={query({ isPending: true, fetchStatus: 'fetching' })} skeleton={<p>shape</p>}>
      {(d) => d}
    </QueryState>,
  )
  expect(screen.queryByText('shape')).toBeNull()
  act(() => vi.advanceTimersByTime(SHOW_AFTER_MS))
  expect(screen.getByText('shape')).toBeInTheDocument()
})

it('a page that failed: a centred notice with Retry; elsewhere a banner', () => {
  const failed = query({ isError: true, error: new Error('daemon down') as never })
  const { unmount } = render(
    <QueryState query={failed} page>
      {(d) => d}
    </QueryState>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(failed.refetch).toHaveBeenCalled()
  unmount()
  render(<QueryState query={failed}>{(d) => d}</QueryState>)
  expect(screen.getByRole('alert')).toHaveTextContent('daemon down')
})
