import { useCallback, useEffect, useState, type RefObject } from 'react'
import { axisOf } from '@/components/ui/gesture'

/** How far a finger goes up or down the composer before it opens or closes the + panel (CSS px). */
export const SWIPE_PX = 40

/** Where a textarea's content can still scroll: toward its end (a finger moving up) or its start. */
export interface Scrollable {
  up: boolean
  down: boolean
}

/**
 * What a touch that moved `dx`, `dy` on the composer does to the + panel: a swipe up opens it, a swipe
 * down closes it. Only a mostly vertical one (`axisOf`) of SWIPE_PX or more; and never one a textarea
 * under the finger would scroll with instead (content left toward where the finger is taking it).
 */
export function panelSwipe(dx: number, dy: number, open: boolean, scroll: Scrollable | null): 'open' | 'close' | null {
  if (axisOf(dx, dy) !== 'y' || Math.abs(dy) < SWIPE_PX) return null
  if (dy < 0) return open || scroll?.down ? null : 'open' // finger up: the text would move toward its end
  return !open || scroll?.up ? null : 'close'
}

/** How the textarea a touch started in (if any) can still scroll. */
function scrollableAt(target: EventTarget | null): Scrollable | null {
  const area = target instanceof Element ? target.closest('textarea') : null
  if (!area || area.scrollHeight <= area.clientHeight + 1) return null
  return { up: area.scrollTop > 0, down: area.scrollTop + area.clientHeight < area.scrollHeight - 1 }
}

/**
 * The + panel's open state: never kept. It is the session's while its page shows (pressing arrows a few
 * times keeps it open), and closed on another session, back on the list, or a reload.
 */
export function useComposerPanel(sessionKey: string) {
  const [state, setState] = useState({ key: sessionKey, open: false })
  if (state.key !== sessionKey) setState({ key: sessionKey, open: false }) // another session: closed, and stays so coming back
  const open = state.key === sessionKey && state.open
  const setOpen = useCallback((next: boolean) => setState({ key: sessionKey, open: next }), [sessionKey])
  return [open, setOpen] as const
}

/**
 * A vertical swipe on the composer (`box`: the panel and the message row) opens or closes the + panel,
 * by touch only (`panelSwipe`). It only listens (passive): scrolling, the phone's keyboard and taps are
 * left as they are, and a swipe from the screen's bottom edge is the system's, never the page's.
 */
export function usePanelSwipe(box: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    const el = box.current
    if (!el) return
    let start: { x: number; y: number; scroll: Scrollable | null } | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, scroll: scrollableAt(e.target) } : null
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!start || !t || e.touches.length !== 1) return void (start = null)
      const act = panelSwipe(t.clientX - start.x, t.clientY - start.y, open, start.scroll)
      if (!act) return
      start = null // once per swipe
      setOpen(act === 'open')
    }
    const onEnd = () => void (start = null)
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [box, open, setOpen])
}
