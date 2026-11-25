import { useEffect, type RefObject } from 'react'

/** How far a wheel event means in pixels, as the browser would scroll it: lines by the box's line height,
 *  pages by its width. */
export function wheelPx(e: WheelEvent, el: HTMLElement, delta = e.deltaY): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * el.clientWidth
  if (e.deltaMode !== WheelEvent.DOM_DELTA_LINE) return delta
  const style = getComputedStyle(el)
  const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2 // `normal`: about 1.2
  return delta * line
}

/**
 * A row that scrolls sideways takes a mouse's vertical wheel as sideways too, as browsers do only with Shift.
 * Only while it overflows, only for a wheel that is mostly vertical (a sideways one, a trackpad's swipe, Shift
 * and pinch are the browser's), and only while it can still move that way: at its ends the wheel goes on to
 * the page or list around it. It follows the wheel at once, a notch as a trackpad's stream: no easing to wait
 * for. Its listener is not passive, so it can take the wheel from the page, and on this one element only.
 */
export function useWheelScrollsX(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max < 1) return
      const by = wheelPx(e, el)
      const from = el.scrollLeft
      if (by > 0 ? from >= max - 1 : from <= 1) return // at that end: the page's scroll, not ours
      e.preventDefault()
      el.scrollLeft = Math.min(max, Math.max(0, from + by))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [ref])
}

/** Whether the reader asked for less motion: then a scroll jumps. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
