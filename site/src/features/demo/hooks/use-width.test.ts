import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useWidth } from './use-width'

describe('useWidth', () => {
  it('reads the element’s width', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'clientWidth', { value: 640 })
    const { result } = renderHook(() => useWidth({ current: element }))
    expect(result.current).toBe(640)
  })

  it('is 0 with nothing to measure', () => {
    expect(renderHook(() => useWidth({ current: null })).result.current).toBe(0)
  })
})
