import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, GRACE_MS, useOutbox } from './outbox'
import { useOutgoing } from './use-outbox'

beforeEach(() => {
  vi.useFakeTimers()
  useOutbox.setState({ sent: {} })
})
afterEach(() => vi.useRealTimers())

it('shows a sent message until its conversation has it, and says so when it waits too long', () => {
  let items: ConversationItem[] = [{ seq: 1, kind: 'prompt', text: 'hi' }]
  let working = false // sent to an idle session, which starts working on it
  const { result, rerender } = renderHook(() => useOutgoing('nas', 's1', items, working))
  let first!: { sent: () => void }
  act(() => {
    first = result.current.track!('hi')
  })
  expect(result.current.pending.map((m) => m.state)).toEqual(['sending']) // the earlier "hi" is not it
  working = true
  rerender()
  act(() => first.sent())
  expect(result.current.pending.map((m) => m.state)).toEqual(['waiting'])

  working = false
  rerender()
  act(() => result.current.track!('again').sent())
  working = true
  rerender()
  items = [...items, { seq: 2, kind: 'prompt', text: 'hi' }]
  rerender()
  expect(result.current.pending.map((m) => m.text)).toEqual(['again'])
  expect(useOutbox.getState().sent['nas/s1']?.map((m) => m.seq)).toEqual([2, undefined]) // kept, as confirmed

  act(() => vi.advanceTimersByTime(CONFIRM_MS))
  expect(result.current.pending.map((m) => m.state)).toEqual(['unconfirmed'])
  act(() => result.current.dismiss(result.current.pending[0]!.id))
  expect(result.current.pending).toEqual([])
  expect(useOutbox.getState().sent['nas/s1']).toBeUndefined() // all confirmed or put away: dropped
})

it('tracks nothing until the conversation is loaded', () => {
  const { result } = renderHook(() => useOutgoing('nas', 's1', undefined))
  expect(result.current.track).toBeUndefined()
})

it('queues what is sent while the agent works, confirms it when recorded, and says when it did not go in', () => {
  let items: ConversationItem[] = [{ seq: 1, kind: 'reply', text: 'working…' }]
  let working = true
  const { result, rerender } = renderHook(() => useOutgoing('nas', 's1', items, working))
  act(() => result.current.track!('first, pasted\n\ntext').sent())
  act(() => result.current.track!('second').sent())
  expect(result.current.pending.map((m) => m.state)).toEqual(['queued', 'queued'])

  // The agent took the first in, recorded with the tags it puts around pasted text.
  items = [...items, { seq: 2, kind: 'prompt', text: '<pasted_content id="x1">\nfirst, pasted\ntext\n</pasted_content id="x1">' }]
  rerender()
  expect(result.current.pending.map((m) => m.text)).toEqual(['second'])

  // Then stopped (interrupted: its queue cleared) without the second.
  working = false
  rerender()
  expect(result.current.pending.map((m) => m.state)).toEqual(['queued'])
  act(() => vi.advanceTimersByTime(GRACE_MS))
  expect(result.current.pending.map((m) => m.state)).toEqual(['undelivered'])
})
