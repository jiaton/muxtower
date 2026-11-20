import { useEffect, type RefObject } from 'react'

const NOTCH_PX = 50 // a pixel wheel step this big is a mouse's notch (eased), not a trackpad's stream (followed)
const SETTLE_MS = 400 // an eased scroll still running is aimed on from where it was going, until then

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
 * the page or list around it. A mouse's notch eases, a trackpad's stream follows the fingers. Its listener is
 * not passive, so it can take the wheel from the page, and on this one element only.
 */
export function useWheelScrollsX(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let aim: number | null = null // where an eased scroll is going
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      aim = null
      clearTimeout(timer)
    }
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max < 1) return
      const by = wheelPx(e, el)
      const from = aim ?? el.scrollLeft
      if (by > 0 ? from >= max - 1 : from <= 1) return // at that end: the page's scroll, not ours
      const to = Math.min(max, Math.max(0, from + by))
      e.preventDefault()
      const ease = (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(e.deltaY) >= NOTCH_PX) && !reducedMotion()
      if (!ease) {
        settle()
        el.scrollLeft = to
        return
      }
      aim = to
      clearTimeout(timer)
      timer = setTimeout(settle, SETTLE_MS)
      el.scrollTo({ left: to, behavior: 'smooth' })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('scrollend', settle)
    return () => {
      settle()
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('scrollend', settle)
    }
  }, [ref])
}

/** Whether the reader asked for less motion: then a scroll jumps. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
