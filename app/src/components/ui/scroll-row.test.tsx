import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollRow } from './scroll-row'

/** A row laid out as a browser would: `width` in view of `content`, scrolled to `left`. jsdom has no layout. */
function row({ width = 200, content = 600, left = 0 } = {}) {
  render(
    <ScrollRow>
      <span>one</span>
      <span>two</span>
    </ScrollRow>,
  )
  const el = document.querySelector<HTMLElement>('[data-scroll-row]')!
  let at = left
  const max = () => Math.max(0, content - width)
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => Math.max(width, content) })
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => at,
    set: (v: number) => {
      at = Math.min(max(), Math.max(0, v))
    },
  })
  const scrolled = (left: number) => {
    at = Math.min(max(), Math.max(0, left))
    fireEvent.scroll(el)
  }
  el.scrollTo = vi.fn((o: ScrollToOptions) => scrolled(o.left ?? at)) as typeof el.scrollTo
  el.scrollBy = vi.fn((o: ScrollToOptions) => scrolled(at + (o.left ?? 0))) as typeof el.scrollBy
  act(() => fireEvent.scroll(el)) // measured with its size
  return { el, left: () => at }
}

/** A wheel over the row: whether the row took it from the page (prevented the browser's own). */
function wheel(el: HTMLElement, init: WheelEventInit) {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  act(() => void el.dispatchEvent(e))
  return e.defaultPrevented
}

afterEach(() => vi.restoreAllMocks())

describe('a vertical wheel over a row that scrolls sideways', () => {
  it('scrolls it sideways while it overflows: a trackpad’s stream at once, a mouse’s notch eased', () => {
    const { el, left } = row()
    expect(wheel(el, { deltaY: 30 })).toBe(true) // a trackpad: followed
    expect(left()).toBe(30)
    expect(el.scrollTo).not.toHaveBeenCalled()
    expect(wheel(el, { deltaY: 100 })).toBe(true) // a mouse's notch: eased
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 130, behavior: 'smooth' })
    expect(wheel(el, { deltaY: -100 })).toBe(true)
    expect(left()).toBe(30)
  })

  it('counts lines and pages as the browser would', () => {
    const { el } = row({ content: 2000 })
    el.style.lineHeight = '20px'
    wheel(el, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE })
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 60, behavior: 'smooth' })
    wheel(el, { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_PAGE })
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 260, behavior: 'smooth' }) // a page on from where it was going
  })

  it('takes nothing at its ends: the page or list around it scrolls', () => {
    const { el, left } = row({ left: 0 })
    expect(wheel(el, { deltaY: -40 })).toBe(false) // at the start, going back
    expect(wheel(el, { deltaY: 30 })).toBe(true)
    expect(wheel(el, { deltaY: 1000 })).toBe(true) // to the end, no further
    expect(left()).toBe(400)
    expect(wheel(el, { deltaY: 30 })).toBe(false) // at the end
    expect(left()).toBe(400)
  })

  it('takes nothing from a row that fits', () => {
    const { el, left } = row({ width: 600, content: 600 })
    expect(wheel(el, { deltaY: 100 })).toBe(false)
    expect(wheel(el, { deltaY: 30 })).toBe(false)
    expect(left()).toBe(0)
  })

  it('leaves a sideways wheel (a trackpad’s swipe), Shift and pinch to the browser', () => {
    const { el, left } = row()
    expect(wheel(el, { deltaX: 40, deltaY: 10 })).toBe(false)
    expect(wheel(el, { deltaX: 40, deltaY: 0 })).toBe(false)
    expect(wheel(el, { deltaY: 100, shiftKey: true })).toBe(false)
    expect(wheel(el, { deltaY: 100, ctrlKey: true })).toBe(false)
    expect(left()).toBe(0)
  })
})

describe('where there is more to scroll', () => {
  it('fades that edge and offers ‹ or › there, each scrolling about a page', () => {
    const { el, left } = row()
    expect(el).not.toHaveAttribute('data-more-start')
    expect(el).toHaveAttribute('data-more-end')
    expect(screen.queryByRole('button', { name: 'Scroll left' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }))
    expect(left()).toBe(160)
    expect(el).toHaveAttribute('data-more-start')
    expect(el).toHaveAttribute('data-more-end')
    fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }))
    expect(left()).toBe(400)
    expect(el).not.toHaveAttribute('data-more-end')
    expect(screen.queryByRole('button', { name: 'Scroll right' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Scroll left' }))
    expect(left()).toBe(240)
  })

  it('a row that fits: no fade, no ‹ ›', () => {
    const { el } = row({ width: 600, content: 600 })
    expect(el).not.toHaveAttribute('data-more-start')
    expect(el).not.toHaveAttribute('data-more-end')
    expect(screen.queryByRole('button', { name: /^Scroll/ })).toBeNull()
  })

  it('‹ › only on a hovering pointer (never on touch), out of the tab order', () => {
    row()
    const next = screen.getByRole('button', { name: 'Scroll right' })
    expect(next.className).toMatch(/\binvisible\b/)
    expect(next.className).toMatch(/group-hover\/scroll-row:visible/) // Tailwind's hover: only where hover is real
    expect(next).toHaveAttribute('tabindex', '-1')
  })
})
