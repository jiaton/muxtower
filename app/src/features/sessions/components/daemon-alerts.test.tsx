import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SETTLE_MS, resetResume } from '@/lib/resume'
import type { DaemonSessions } from '../api/use-sessions'
import { DaemonAlerts } from './daemon-alerts'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: unknown }) => children }))

let visibility: DocumentVisibilityState = 'visible'
beforeEach(() => {
  vi.useFakeTimers()
  resetResume()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.advanceTimersByTime(SETTLE_MS * 2) // the app has been open a while
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const failing: DaemonSessions[] = [
  {
    daemon: { id: 'd1', name: 'nas', url: 'https://nas.example', token: 't' },
    sessions: [],
    error: new TypeError('Failed to fetch'),
    isPending: false,
    updatedAt: 0,
  },
]

it('back from the background: no "unreachable" off what failed while away; a real outage shows after', () => {
  render(<DaemonAlerts daemons={failing} />)
  expect(screen.getByText(/nas:/)).toBeInTheDocument() // open a while, and failing: said

  act(() => {
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
  })
  act(() => {
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(screen.queryByText(/nas:/)).toBeNull() // just back: asked again, not called unreachable

  act(() => void vi.advanceTimersByTime(SETTLE_MS + 20))
  expect(screen.getByText(/nas:/)).toBeInTheDocument() // still failing after that: a real outage
})
