import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, LAND_EASE, landing, landMs, sideways, Speed, type Pull } from './gesture'

/**
 * A navigation drawer (Material's modal drawer): while `drawer`, `children` sit in a panel that slides in
 * from the left over the page when `open`, over a scrim that closes it (as do Escape and following a link
 * inside, and a swipe left that follows the finger). Shut, it can be pulled open with the finger by a swipe
 * that something else hands on (`onPull` gives the drawer's `Pull`: e.g. a pager's, past its first page).
 * Otherwise `children` lay out where they are, as if there were no drawer. Either way they stay mounted,
 * so what they hold (a scroll position, folded groups) is there when the drawer opens.
 */
export function Drawer({
  drawer,
  open,
  onOpenChange,
  label,
  onPull,
  over,
  children,
}: {
  drawer: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  onPull?: (pull: Pull | null) => void
  /** Above another drawer (the sidebar over the session list's). */
  over?: boolean
  children: ReactNode
}) {
  const shown = drawer && open
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  useSwipeClose(panel, scrim, shown, () => onOpenChange(false))
  usePullOpen(panel, scrim, drawer && !open, () => onOpenChange(true), onPull)

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shown, onOpenChange])

  return (
    <>
      {drawer ? (
        <div
          ref={scrim}
          aria-hidden
          onClick={() => onOpenChange(false)}
          className={cn(
            'fixed inset-0 bg-overlay transition-opacity duration-200',
            over ? 'z-[60]' : 'z-40',
            shown ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
      ) : null}
      <div
        ref={panel}
        role={drawer ? 'dialog' : undefined}
        aria-modal={shown || undefined}
        aria-label={drawer ? label : undefined}
        inert={drawer && !open}
        onClick={(e) => drawer && (e.target as Element).closest('a[href]') && onOpenChange(false)}
        className={cn(
          drawer
            ? cn(
                'fixed inset-y-0 left-0 flex w-[min(85vw,24rem)] bg-bg shadow-card transition-transform duration-200 ease-out',
                over ? 'z-[70]' : 'z-50',
              )
            : 'contents',
          drawer && !open && '-translate-x-full',
        )}
      >
        {children}
      </div>
    </>
  )
}

/** While `active` (the drawer shut), the `Pull` that opens it with the finger, handed to `onPull` (null
 *  otherwise): the drawer and scrim follow it and, let go, it opens or goes back by how far and how fast. */
function usePullOpen(
  panel: RefObject<HTMLDivElement | null>,
  scrim: RefObject<HTMLDivElement | null>,
  active: boolean,
  open: () => void,
  onPull?: (pull: Pull | null) => void,
) {
  const opening = useRef(open)
  opening.current = open
  useEffect(() => {
    const el = panel.current
    const behind = scrim.current
    if (!active || !el || !behind || !onPull) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const place = (at: number, ms: number) => {
      const width = Math.max(1, el.offsetWidth)
      // `translate`, which its classes shut it with (a transform would add to that).
      el.style.transition = ms ? `translate ${ms}ms ${LAND_EASE}` : 'none'
      behind.style.transition = ms ? `opacity ${ms}ms ${LAND_EASE}` : 'none'
      el.style.translate = `${at - width}px`
      behind.style.opacity = String(at / width)
    }
    onPull({
      move: (px) => {
        clearTimeout(timer)
        place(Math.min(px, el.offsetWidth), 0)
      },
      end: (px, speed) => {
        const width = el.offsetWidth
        const at = Math.min(px, width)
        const opened = landing(at, speed, at) > width / 2
        const ms = landMs(opened ? width - at : at, speed)
        place(opened ? width : 0, ms)
        // Then to where its classes put it (open, or shut), once it is there.
        timer = setTimeout(() => (el.style.transition = behind.style.transition = el.style.translate = behind.style.opacity = ''), ms + 50)
        if (opened) opening.current()
      },
    })
    return () => onPull(null)
  }, [panel, scrim, active, onPull])
}

/** While `active`, a swipe left on the drawer or its scrim drags the drawer with the finger, and let go,
 *  closes it or puts it back by how far and how fast it went. A swipe right, or one on a list row that is
 *  showing its actions (`data-swipe-open`), is left to what is under it. */
function useSwipeClose(
  panel: RefObject<HTMLDivElement | null>,
  scrim: RefObject<HTMLDivElement | null>,
  active: boolean,
  close: () => void,
) {
  const closing = useRef(close)
  closing.current = close
  useEffect(() => {
    const el = panel.current
    const behind = scrim.current
    if (!active || !el || !behind) return
    let g: { x: number; y: number; at: number; axis?: 'x' | 'y'; speed: Speed } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      const leave = e.touches.length !== 1 || !t || (e.target instanceof Element && e.target.closest('[data-swipe-open]'))
      g = leave ? null : { x: t.clientX, y: t.clientY, at: 0, speed: new Speed() }
      g?.speed.add(t!.clientX)
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!g || !t) return
      const dx = t.clientX - g.x
      g.speed.add(t.clientX)
      if (!g.axis) {
        g.axis = axisOf(dx, t.clientY - g.y)
        if (!g.axis) return
        if (g.axis === 'y' || dx > 0 || sideways(e.target, el, dx)) {
          g = null // a scroll, a swipe right (a row's), or one along a row that scrolls: not the drawer's
          return
        }
      }
      g.at = Math.min(0, dx)
      el.style.transition = behind.style.transition = 'none'
      el.style.transform = `translateX(${g.at}px)`
      behind.style.opacity = String(1 + g.at / Math.max(1, el.offsetWidth))
    }
    const up = (e: TouchEvent) => {
      const swipe = g
      g = null
      if (swipe?.axis !== 'x') return
      const t = e.changedTouches[0]
      if (t && e.type === 'touchend') swipe.speed.add(t.clientX)
      const speed = swipe.speed.get()
      const width = el.offsetWidth
      const shut = landing(swipe.at, speed, swipe.at) < -width / 2
      const ms = landMs(shut ? width + swipe.at : swipe.at, speed)
      el.style.transition = `transform ${ms}ms ${LAND_EASE}`
      behind.style.transition = `opacity ${ms}ms ${LAND_EASE}`
      el.style.transform = behind.style.opacity = '' // to where its classes put it: shut or open
      clearTimeout(timer)
      timer = setTimeout(() => (el.style.transition = behind.style.transition = ''), ms + 50)
      if (shut) closing.current()
    }
    const targets = [el, behind]
    for (const target of targets) {
      target.addEventListener('touchstart', down, { passive: true })
      target.addEventListener('touchmove', move, { passive: true })
      target.addEventListener('touchend', up)
      target.addEventListener('touchcancel', up)
    }
    const released = targets.map((target) => holdScroll(target, () => g?.axis === 'x')) // after `move`
    return () => {
      released.forEach((release) => release())
      for (const target of targets) {
        target.removeEventListener('touchstart', down)
        target.removeEventListener('touchmove', move)
        target.removeEventListener('touchend', up)
        target.removeEventListener('touchcancel', up)
      }
      el.style.transform = behind.style.opacity = ''
    }
  }, [panel, scrim, active])
}
