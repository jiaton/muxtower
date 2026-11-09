import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLive } from '../live/engine'
import { LiveBar, LiveButton } from './live'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
afterEach(() => useLive.setState({ phase: 'off', speaking: false, pending: 0, error: null, commands: { state: 'off' }, heard: null }))

it('writing: says so, in the accent, with the commands to say', () => {
  useLive.setState({ phase: 'listening', commands: { state: 'ready' }, pending: 2 })
  render(
    <>
      <LiveBar />
      <LiveButton />
    </>,
  )
  expect(screen.getByText('Live · writing what you say')).toBeInTheDocument()
  expect(screen.getByRole('status').textContent).toBe(
    'Live · writing what you say· say send to send, pause to stop writing · commands on device · transcribing 2',
  )
  expect(screen.getByRole('button', { name: 'Live: writing. Turn Live off' })).toBeInTheDocument()
})

it('commands only (paused): another look, how to write again, and a tap', () => {
  useLive.setState({ phase: 'paused', commands: { state: 'ready' } })
  render(
    <>
      <LiveBar />
      <LiveButton />
    </>,
  )
  expect(screen.getByRole('status').textContent).toContain('Commands only· say resume to write again')
  expect(screen.getByRole('button', { name: /Write again/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Live: commands only. Turn Live off' })).toBeInTheDocument()
  expect(screen.queryByText('Live · writing what you say')).toBeNull()
})

it('paused without the spotter: nothing can be heard, only a tap resumes', () => {
  useLive.setState({ phase: 'paused', commands: { state: 'off' } })
  render(<LiveBar />)
  expect(screen.getByRole('status').textContent).toContain('Paused· tap to resume')
  expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument()
})

it("what was heard takes the hint's place in the same row, then the hint comes back", () => {
  vi.useFakeTimers()
  useLive.setState({
    phase: 'listening',
    commands: { state: 'ready' },
    heard: { event: { kind: 'command', command: 'send', done: true, how: 'on device' }, at: Date.now() },
  })
  render(<LiveBar />)
  expect(screen.getByRole('status').textContent).toBe('Live · writing what you say✓ sent')
  expect(screen.queryByLabelText('Last heard')).toBeNull() // no row of its own
  act(() => void vi.advanceTimersByTime(2100))
  expect(screen.getByRole('status').textContent).toContain('say send to send')
  vi.useRealTimers()
})
