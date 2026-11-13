import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_MS, useGuardedKeys } from './use-guarded-keys'

const WHY = 'On an empty prompt, ← moves this conversation to the background in Claude Code. Tap again to send.'
const guardLeft = (key: string) => (key === 'Left' ? WHY : null)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  const sent: string[] = []
  const hook = renderHook(() => useGuardedKeys(guardLeft, (k) => sent.push(k)))
  const press = (key: string) => act(() => hook.result.current.press(key))
  return { sent, press, hint: () => hook.result.current.hint }
}

describe('useGuardedKeys', () => {
  it('a guarded key: the first tap explains and sends nothing, a second one sends it', () => {
    const t = setup()
    t.press('Left')
    expect(t.sent).toEqual([])
    expect(t.hint()).toBe(WHY)
    t.press('Left')
    expect(t.sent).toEqual(['Left'])
    expect(t.hint()).toBeNull()
  })
  it('the other keys go at once, and forget a first tap', () => {
    const t = setup()
    t.press('Up')
    t.press('Right')
    expect(t.sent).toEqual(['Up', 'Right'])
    t.press('Left')
    t.press('Down')
    t.press('Left')
    expect(t.sent).toEqual(['Up', 'Right', 'Down'])
  })
  it('after the wait, a tap asks again', () => {
    const t = setup()
    t.press('Left')
    act(() => vi.advanceTimersByTime(CONFIRM_MS + 1))
    expect(t.hint()).toBeNull()
    t.press('Left')
    expect(t.sent).toEqual([])
    expect(t.hint()).toBe(WHY)
  })
})
