import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTargetBox } from './use-target-box'

const rect = (x: number, y: number, width: number, height: number) => () => ({ left: x, top: y, width, height }) as DOMRect

describe('useTargetBox', () => {
  it('measures the target in stage units, undoing the scale', () => {
    const stage = document.createElement('div')
    const target = document.createElement('button')
    target.dataset.demo = 'send'
    stage.append(target)
    stage.getBoundingClientRect = rect(100, 50, 600, 350)
    target.getBoundingClientRect = rect(400, 250, 40, 20)
    const ref = { current: stage }
    const { result } = renderHook(() => useTargetBox(ref, 'send', 0.5, 0))
    expect(result.current).toEqual({ x: 600, y: 400, width: 80, height: 40 })
  })

  it('is null without a target', () => {
    const ref = { current: document.createElement('div') }
    expect(renderHook(() => useTargetBox(ref, 'none', 1, 0)).result.current).toBeNull()
  })
})
