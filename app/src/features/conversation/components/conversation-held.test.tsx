import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/lib/api/types'
import { useOutbox } from '@/lib/outbox'
import { useOutgoing } from '@/lib/use-outbox'
import { composerNote, waitingNote } from '@/features/sessions/model/facets'
import { ConversationView, SEND_AGAIN_MS } from './conversation-view'

// A message sent to a Remote Control session that its agent has not taken in yet (the Claude desktop app
// holds one from muxtower until Deliver is clicked there), and a send that failed: never shown as done.

beforeEach(() => {
  vi.useFakeTimers()
  useOutbox.setState({ sent: {} })
})
afterEach(() => vi.useRealTimers())

const desktop = { source: 'remote_control', origin: 'claude_code_claude_desktop', machine: 'build-box' } as Session

it('says where a message waits, for a session open in the Claude app, and only there', () => {
  expect(waitingNote(desktop)).toBe('Waiting for Deliver in the Claude app on build-box')
  expect(composerNote(desktop)).toBe('This session is open in the Claude app on build-box: messages wait for Deliver there')
  const cli = { ...desktop, origin: 'claude_code_cli' } as Session
  expect(waitingNote(cli)).toBe('Not taken in yet')
  expect(composerNote(cli)).toBeNull()
})

it('shows a message the agent has not taken in as waiting, then as taken in once it is', () => {
  const at = new Date().toISOString()
  const held: ConversationItem = { seq: 16, at, kind: 'prompt', text: 'Plan the launch', status: 'pending' }
  const { rerender } = render(<ConversationView items={[held]} waiting="Waiting for Deliver in the Claude app on build-box" />)
  expect(screen.getByText('Waiting for Deliver in the Claude app on build-box')).toBeInTheDocument()
  rerender(<ConversationView items={[{ ...held, status: null }]} waiting="Waiting for Deliver in the Claude app on build-box" />)
  expect(screen.queryByText(/Waiting for Deliver/)).toBeNull()
  expect(screen.getByText('Plan the launch')).toBeInTheDocument()
})

it('offers to send again a message still not taken in after a while', () => {
  const again = vi.fn()
  const held: ConversationItem = { seq: 16, at: new Date().toISOString(), kind: 'prompt', text: 'Plan the launch', status: 'pending' }
  render(<ConversationView items={[held]} waiting="Waiting for Deliver in the Claude app on build-box" onSendAgain={again} />)
  expect(screen.queryByRole('button', { name: /Send again/ })).toBeNull()
  act(() => vi.advanceTimersByTime(SEND_AGAIN_MS))
  fireEvent.click(screen.getByRole('button', { name: 'Not delivered? Send again' }))
  expect(again).toHaveBeenCalledWith('Plan the launch')
})

it('keeps a failed choice tap in the conversation with Retry and Dismiss', () => {
  const items: ConversationItem[] = [
    { seq: 1, kind: 'reply', text: 'Shall I go on?' },
    { seq: 2, kind: 'next_step', status: 'pending', ask: 'Go on?', actions: [{ label: 'Go on', message: 'Go on' }] },
  ]
  const { result } = renderHook(() => useOutgoing('nas', 's1', items))
  // The page's reply: shown on its way, said not sent if its request fails.
  const reply = (text: string) => result.current.track!(text).failed(new TypeError('Failed to fetch'))
  const view = () => (
    <ConversationView
      items={items}
      pending={result.current.pending}
      onReply={reply}
      onResend={(m) => {
        result.current.dismiss(m.id)
        reply(m.text)
      }}
      onDismiss={result.current.dismiss}
    />
  )
  const { rerender } = render(view())
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Go on' })))
  rerender(view())
  expect(screen.getByRole('alert')).toHaveTextContent('Not sent: No answer from the daemon')
  expect(result.current.pending.map((m) => [m.text, m.state])).toEqual([['Go on', 'failed']])

  act(() => fireEvent.click(screen.getByRole('button', { name: 'Retry' })))
  rerender(view())
  expect(result.current.pending).toHaveLength(1) // sent again (and failed again): one, not two
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })))
  rerender(view())
  expect(result.current.pending).toEqual([])
  expect(screen.getByRole('button', { name: 'Go on' })).toBeInTheDocument() // the choices are back
})
