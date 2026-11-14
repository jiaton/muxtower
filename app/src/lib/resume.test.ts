import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SETTLE_MS, onResume, resetResume, settling, useSettling } from './resume'

let visibility: DocumentVisibilityState = 'visible'
beforeEach(() => {
  vi.useFakeTimers()
  resetResume()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const hide = () => {
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}
const show = () => {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

it('one return is one resume, however many events it sends; hidden is none', () => {
  const resumed = vi.fn()
  const stop = onResume(resumed)
  hide()
  expect(resumed).not.toHaveBeenCalled()
  show()
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('pageshow'))
  expect(resumed).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(2_000)
  window.dispatchEvent(new Event('online')) // the network back, later: another
  expect(resumed).toHaveBeenCalledTimes(2)
  stop()
})

it('settling while hidden and for a few seconds after coming back: failures then are not an outage', () => {
  vi.advanceTimersByTime(SETTLE_MS * 2)
  expect(settling()).toBe(false)
  hide()
  expect(settling()).toBe(true)
  show()
  expect(settling()).toBe(true)
  vi.advanceTimersByTime(SETTLE_MS)
  expect(settling()).toBe(false)
})

it('useSettling follows it in a component', () => {
  vi.advanceTimersByTime(SETTLE_MS * 2)
  const { result } = renderHook(() => useSettling())
  expect(result.current).toBe(false)
  act(() => hide())
  expect(result.current).toBe(true)
  act(() => show())
  expect(result.current).toBe(true)
  act(() => void vi.advanceTimersByTime(SETTLE_MS + 20))
  expect(result.current).toBe(false)
})
