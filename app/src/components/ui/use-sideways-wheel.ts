import { useEffect, useRef, type RefObject } from 'react'
import { sidewaysWheel } from './sideways-wheel'
import { wheelPx } from './use-wheel-scrolls-x'

/**
 * Calls `onStep` with -1 or 1 for a sideways wheel over `ref` (`sideways-wheel.ts`: a notched wheel once per
 * notch, a trackpad once per gesture). Its listener is passive: it reads the wheel and never takes it, so the
 * box still scrolls as it would (a vertical wheel, a trackpad's slant), and a box with nothing to scroll
 * sideways loses nothing. Pinch (Ctrl) is the browser's zoom. It listens on the document, so a box mounted later (after a first empty render) is
 * heard too.
 */
export function useSidewaysWheel(ref: RefObject<HTMLElement | null>, onStep: (by: -1 | 1) => void, enabled = true) {
  const step = useRef(onStep)
  useEffect(() => {
    step.current = onStep
  })
  useEffect(() => {
    if (!enabled) return
    const model = sidewaysWheel()
    const wheel = (e: WheelEvent) => {
      const el = ref.current
      if (e.ctrlKey || !el || !(e.target instanceof Node) || !el.contains(e.target)) return
      const by = model.feed({
        dx: wheelPx(e, el, e.deltaX),
        dy: wheelPx(e, el, e.deltaY),
        shift: e.shiftKey,
        at: e.timeStamp,
        lines: e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL,
      })
      if (by) step.current(by)
    }
    document.addEventListener('wheel', wheel, { passive: true })
    return () => document.removeEventListener('wheel', wheel)
  }, [ref, enabled])
}
