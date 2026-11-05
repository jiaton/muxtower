import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBackCloses } from '@/lib/use-back-closes'
import { useSidebarDrawer } from '@/lib/sidebar-drawer'
import { EDGE_PX, startsPull, useSidebarPull } from './use-sidebar-pull'

function List() {
  const ref = useRef<HTMLDivElement>(null)
  useSidebarPull(ref, true)
  return (
    <div ref={ref} data-testid="list">
      <nav data-own-swipe data-testid="chips">
        chips
      </nav>
      <div data-testid="row">a row</div>
      <div data-swipe-open data-testid="open-row">
        a row showing its actions
      </div>
    </div>
  )
}

function pullSpy() {
  const pull = { move: vi.fn(), end: vi.fn() }
  useSidebarDrawer.setState({ pull })
  return pull
}

const swipe = (el: Element, from: number, to: number) => {
  fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 100 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: (from + to) / 2, clientY: 101 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: to, clientY: 102 }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: 102 }] })
}

afterEach(() => useSidebarDrawer.setState({ open: false, pull: null }))

describe('where a swipe right may pull the sidebar', () => {
  it('not at the screen’s edge, not on the chip rows, not on a row showing its actions; a row counts', () => {
    const { getByTestId } = render(<List />)
    const root = getByTestId('list')
    expect(startsPull(getByTestId('row'), EDGE_PX - 1, root)).toBe(false) // the system's back
    expect(startsPull(getByTestId('row'), EDGE_PX + 40, root)).toBe(true)
    expect(startsPull(getByTestId('chips'), 120, root)).toBe(false)
    expect(startsPull(getByTestId('open-row'), 120, root)).toBe(false)
  })

  it('a swipe right on the list pulls it with the finger; a swipe left (a row’s actions) does not', () => {
    const pull = pullSpy()
    const { getByTestId } = render(<List />)
    swipe(getByTestId('row'), 60, 200)
    expect(pull.move).toHaveBeenCalled()
    expect(pull.end).toHaveBeenCalledWith(140, expect.any(Number))
    pull.move.mockClear()
    pull.end.mockClear()
    swipe(getByTestId('row'), 200, 60)
    swipe(getByTestId('chips'), 60, 200)
    swipe(getByTestId('row'), 10, 200) // from the edge
    expect(pull.move).not.toHaveBeenCalled()
    expect(pull.end).not.toHaveBeenCalled()
  })
})

describe('Back', () => {
  it('closes what is open instead of leaving the page', () => {
    const setOpen = vi.fn()
    const pushed = vi.spyOn(history, 'pushState')
    renderHook(({ open }) => useBackCloses(open, setOpen), { initialProps: { open: true } })
    expect(pushed).toHaveBeenCalledOnce() // an entry of the same page, for Back to pop
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(setOpen).toHaveBeenCalledWith(false)
    pushed.mockRestore()
  })

  it('closed another way, takes its entry back', () => {
    vi.useFakeTimers()
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const setOpen = vi.fn()
    const { result } = renderHook(() => useBackCloses(true, setOpen))
    act(() => result.current(false))
    vi.advanceTimersByTime(100)
    expect(back).toHaveBeenCalledOnce()
    expect(setOpen).toHaveBeenCalledWith(false)
    back.mockRestore()
    vi.useRealTimers()
  })
})
