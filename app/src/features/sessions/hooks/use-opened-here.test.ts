import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useOpenedHere } from './use-opened-here'

describe('useOpenedHere', () => {
  it('remembers sessions opened from the list until the list changes', () => {
    type Props = { list: string; open?: string; listed: boolean }
    const { result, rerender } = renderHook((p: Props) => useOpenedHere(p.list, p.open, p.listed), {
      initialProps: { list: 'unread', listed: false } as Props,
    })
    expect(result.current).toEqual([])
    rerender({ list: 'unread', open: 'a', listed: true })
    rerender({ list: 'unread', open: undefined, listed: false })
    rerender({ list: 'unread', open: 'b', listed: false }) // from a notification: not in the list
    rerender({ list: 'unread', open: 'c', listed: true })
    rerender({ list: 'unread', open: 'a', listed: false }) // opened again from the kept ones
    expect(result.current).toEqual(['a', 'c'])
    rerender({ list: 'all', open: 'a', listed: true })
    expect(result.current).toEqual([])
  })
})
