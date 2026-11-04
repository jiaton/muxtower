import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePlayer } from './use-player'

describe('usePlayer', () => {
  it('waits off screen, then plays, pauses and seeks on request', () => {
    const stage = { current: document.createElement('div') }
    const { result } = renderHook(() => usePlayer(stage))
    expect(result.current.playing).toBe(false)
    act(() => result.current.play())
    expect(result.current.playing).toBe(true)
    act(() => result.current.pause())
    expect(result.current.playing).toBe(false)
    act(() => result.current.seek(15500))
    expect(result.current.t).toBe(15500)
  })
})
