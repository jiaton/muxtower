import { useEffect, type RefObject } from 'react'
import { axisOf, holdScroll, sideways, Speed } from '@/components/ui/gesture'
import { useSidebarDrawer } from '@/lib/sidebar-drawer'

/** Touches starting this close to the screen's left edge are the system's (Android's and iOS's back). */
export const EDGE_PX = 24

/** Whether a swipe right that began here may pull the sidebar open: not at the screen's edge, not on
 *  what moves sideways itself (the chip rows, `data-own-swipe`; anything that scrolls sideways and can
 *  still go that way), not on a list row showing its actions. */
export function startsPull(target: EventTarget | null, x: number, root: HTMLElement): boolean {
  if (x < EDGE_PX) return false
  const el = target instanceof Element ? target : null
  if (el?.closest('[data-own-swipe], [data-swipe-open]')) return false
  return !sideways(target, root, 1)
}

/** A swipe right on the session list (`el`), anywhere but where `startsPull` says no, pulls the sidebar
 *  open with the finger: one level up, as a swipe right in a session pulls the list. */
export function useSidebarPull(el: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = el.current
    if (!active || !root) return
    let g: { x: number; y: number; axis?: 'x' | 'y'; speed: Speed } | null = null
    const pull = () => useSidebarDrawer.getState().pull
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      g = e.touches.length === 1 && t && startsPull(e.target, t.clientX, root) ? { x: t.clientX, y: t.clientY, speed: new Speed() } : null
      if (g && t) g.speed.add(t.clientX)
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!g || !t) return
      const dx = t.clientX - g.x
      g.speed.add(t.clientX)
      if (!g.axis) {
        g.axis = axisOf(dx, t.clientY - g.y)
        if (!g.axis) return
        if (g.axis === 'y' || dx < 0 || !pull()) {
          g = null // a scroll, or a swipe left (a row's actions): not the sidebar's
          return
        }
      }
      pull()?.move(Math.max(0, dx))
    }
    const up = (e: TouchEvent) => {
      const swipe = g
      g = null
      if (swipe?.axis !== 'x') return
      const t = e.changedTouches[0]
      if (t && e.type === 'touchend') swipe.speed.add(t.clientX)
      pull()?.end(Math.max(0, (t?.clientX ?? swipe.x) - swipe.x), swipe.speed.get())
    }
    root.addEventListener('touchstart', down, { passive: true })
    root.addEventListener('touchmove', move, { passive: true })
    root.addEventListener('touchend', up)
    root.addEventListener('touchcancel', up)
    const release = holdScroll(root, () => g?.axis === 'x')
    return () => {
      release()
      root.removeEventListener('touchstart', down)
      root.removeEventListener('touchmove', move)
      root.removeEventListener('touchend', up)
      root.removeEventListener('touchcancel', up)
    }
  }, [el, active])
}
