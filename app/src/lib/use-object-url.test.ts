import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useObjectUrl } from './use-object-url'

afterEach(() => vi.restoreAllMocks())

function track() {
  let n = 0
  const live = new Set<string>()
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:${++n}`
    live.add(url)
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => void live.delete(url))
  return live
}

it('makes one URL per blob and revokes it when the blob changes or the component goes', () => {
  const live = track()
  const first = new Blob(['a'])
  const { result, rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), { initialProps: { blob: first as Blob | undefined } })
  expect(live.has(result.current!)).toBe(true)
  const was = result.current
  rerender({ blob: first })
  expect(result.current).toBe(was)
  rerender({ blob: new Blob(['b']) })
  expect(result.current).not.toBe(was)
  expect(live.has(was!)).toBe(false)
  expect(live.has(result.current!)).toBe(true)
  unmount()
  expect(live.size).toBe(0)
})

it('never gives a revoked URL when its effect runs twice (StrictMode, a remount) with the blob already there', () => {
  const live = track()
  const blob = new Blob(['cached'])
  const { result, unmount } = renderHook(() => useObjectUrl(blob), { wrapper: StrictMode })
  expect(result.current).toBeDefined()
  expect(live.has(result.current!)).toBe(true) // a picture opened large from the cache: still playable
  unmount()
  expect(live.size).toBe(0)
})

it('gives nothing without a blob', () => {
  const { result } = renderHook(() => useObjectUrl(undefined))
  expect(result.current).toBeUndefined()
})
