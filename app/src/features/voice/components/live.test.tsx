import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLive } from '../live/engine'
import { LiveBar, LiveButton } from './live'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
afterEach(() => useLive.setState({ phase: 'off', speaking: false, pending: 0, error: null, commands: { state: 'off' }, heard: null }))

it('writing: its title follows the moment; the commands to say after it', () => {
  useLive.setState({ phase: 'listening', commands: { state: 'ready' } })
  const { rerender } = render(
    <>
      <LiveBar />
      <LiveButton />
    </>,
  )
  const hint = '· say send or Ctrl+↵ to send, pause to stop writing · commands on device'
  expect(screen.getByRole('status').textContent).toBe(`Live · speak to write${hint}`)
  act(() => useLive.setState({ speaking: true }))
  rerender(
    <>
      <LiveBar />
      <LiveButton />
    </>,
  )
  expect(screen.getByRole('status').textContent).toBe(`Live · hearing you…${hint}`)
  act(() => useLive.setState({ speaking: false, pending: 1 }))
  expect(screen.getByRole('status').textContent).toBe(`Live · writing…${hint}`)
  act(() => useLive.setState({ pending: 2 }))
  expect(screen.getByRole('status').textContent).toBe(`Live · writing… (2)${hint}`)
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
  expect(screen.getByRole('status').textContent).toBe('Live · speak to write✓ sent')
  expect(screen.queryByLabelText('Last heard')).toBeNull() // no row of its own
  act(() => void vi.advanceTimersByTime(2100))
  expect(screen.getByRole('status').textContent).toContain('say send or Ctrl+↵ to send')
  vi.useRealTimers()
})

it('Read aloud: a toggle beside pause; on, the controls grow, Play and Read all whenever there is a reply', async () => {
  const { useSpeech } = await import('../live/speech')
  useSpeech.setState({ readAloud: false, speaking: false, last: null, unheard: {} })
  useLive.setState({ phase: 'listening', commands: { state: 'ready' } })
  const { rerender } = render(<LiveBar daemonId="d" sessionId="s" reply={null} />)
  expect(screen.queryByRole('group', { name: 'Read aloud' })).toBeNull()
  const toggle = screen.getByRole('button', { name: /Read aloud: say each turn/ })
  expect(toggle.className).toMatch(/size-8/)
  act(() => toggle.click())
  expect(useSpeech.getState().readAloud).toBe(true)
  expect(screen.getByRole('button', { name: /Read aloud: on/ }).className).toMatch(/size-10/) // bigger
  expect(screen.getByRole('button', { name: /Stop writing/ }).className).toMatch(/size-10/)
  expect(screen.getByRole('button', { name: /^Play/ })).toBeDisabled() // no reply yet
  rerender(<LiveBar daemonId="d" sessionId="s" reply="Done." />)
  expect(screen.getByRole('button', { name: /^Play/ })).toBeEnabled() // a reply: Play can always say it
  expect(screen.getByRole('button', { name: /Read all/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: /^Stop$/ })).toBeDisabled() // only while speaking
  expect(screen.queryByText('new')).toBeNull()
  act(() => useSpeech.setState({ unheard: { 'd/s': true }, speaking: true }))
  expect(screen.getByRole('button', { name: /^Play/ })).toHaveTextContent('new') // came while away
  expect(screen.getByRole('button', { name: /^Stop$/ })).toBeEnabled()
  act(() => useSpeech.setState({ readAloud: false, last: null, speaking: false, unheard: {} }))
})

it('⌘↵ pressed while still speaking: the bar says it sends once that is written', () => {
  useLive.setState({ phase: 'listening', speaking: true, then: 'send', commands: { state: 'ready' } })
  render(<LiveBar />)
  expect(screen.getByText('Live · hearing you… then sending')).toBeInTheDocument()
})
