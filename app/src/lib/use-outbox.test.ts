import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, useOutbox } from './outbox'
import { useOutgoing } from './use-outbox'

beforeEach(() => {
  vi.useFakeTimers()
  useOutbox.setState({ sent: {} })
})
afterEach(() => vi.useRealTimers())

it('shows a sent message until its conversation has it, and says so when it waits too long', () => {
  let items: ConversationItem[] = [{ seq: 1, kind: 'prompt', text: 'hi' }]
  const { result, rerender } = renderHook(() => useOutgoing('nas', 's1', items))
  let first!: { sent: () => void }
  act(() => {
    first = result.current.track!('hi')
  })
  expect(result.current.pending.map((m) => m.state)).toEqual(['sending']) // the earlier "hi" is not it
  act(() => first.sent())
  expect(result.current.pending.map((m) => m.state)).toEqual(['waiting'])

  act(() => result.current.track!('again').sent())
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
