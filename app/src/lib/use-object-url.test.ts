import { renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useObjectUrl } from './use-object-url'

afterEach(() => vi.restoreAllMocks())

it('makes one URL per blob and revokes it when the blob changes or the component goes', () => {
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:${++n}`)
  URL.revokeObjectURL = vi.fn()
  const first = new Blob(['a'])
  const { result, rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), { initialProps: { blob: first as Blob | undefined } })
  expect(result.current).toBe('blob:1')
  rerender({ blob: first })
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  rerender({ blob: new Blob(['b']) })
  expect(result.current).toBe('blob:2')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
})

it('gives nothing without a blob', () => {
  const { result } = renderHook(() => useObjectUrl(undefined))
  expect(result.current).toBeUndefined()
})
