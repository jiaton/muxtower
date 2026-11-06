import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { afterFrame, axisOf, holdScroll, LAND_EASE, landCurve, landing, sideways, Speed, type Pull } from './gesture'

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
  push,
  children,
}: {
  drawer: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  onPull?: (pull: Pull | null) => void
  /** Above another drawer (the sidebar over the session list's). */
  over?: boolean
  /** A push drawer (Slack's, Discord's): this, the page beside it, slides right as the drawer opens, by
   *  a transform only, so nothing in it changes size (a terminal is not fitted again, its tmux pane not
   *  resized); the strip of it that still shows is dimmed lightly and closes the drawer when tapped. */
  push?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const shown = drawer && open
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  useSwipeClose(panel, scrim, shown, () => onOpenChange(false), push)
  usePullOpen(panel, scrim, drawer && !open, () => onOpenChange(true), onPull, push)

  useEffect(() => {
    const el = push?.current
    if (!el || !drawer) return
    const width = panel.current?.offsetWidth ?? 0
    const target = shown ? `translateX(${width}px)` : ''
    // Already on its way there (a swipe landed it, with its own speed): left alone, not set off again
    // on another curve, which would hitch it and part it from the drawer.
    if (el.style.transform === target) return
    el.style.willChange = ''
    el.style.transition = stillness() ? 'none' : `transform 200ms ${LAND_EASE}`
    el.style.transform = target
  }, [push, drawer, shown])

  // Shut and done sliding: not painted at all. Laid off-screen flush with its edge, a panel of a
  // fractional width (85vw) would otherwise show a sliver of its border at x=0 once a phone's compositor
  // snaps it to device pixels.
  const [settled, setSettled] = useState(!open)
  useEffect(() => {
    const el = panel.current
    if (open || !drawer || !el) return setSettled(open ? false : true)
    if (stillness()) return setSettled(true)
    const done = (e?: TransitionEvent) => {
      if (e && (e.target !== el || !/^(transform|translate)$/.test(e.propertyName))) return
      setSettled(true)
    }
    el.addEventListener('transitionend', done)
    const fallback = setTimeout(done, 1000) // a slide that never ends (cut short, or none)
    return () => {
      el.removeEventListener('transitionend', done)
      clearTimeout(fallback)
    }
  }, [open, drawer])

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
            'fixed inset-0 bg-overlay transition-opacity duration-200 motion-reduce:transition-none',
            over ? 'z-[60]' : 'z-40',
            shown ? (push ? 'opacity-40' : 'opacity-100') : 'pointer-events-none opacity-0',
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
                'fixed inset-y-0 left-0 flex bg-bg transition-transform duration-200 ease-out motion-reduce:transition-none',
                push ? 'w-[min(85vw,18rem)] border-r border-border' : 'w-[min(85vw,24rem)] shadow-card',
                over ? 'z-[70]' : 'z-50',
              )
            : 'contents',
          drawer && !open && '-translate-x-full',
          drawer && !open && settled && 'invisible',
        )}
      >
        {children}
      </div>
    </>
  )
}

/** Whether the viewer asked for less motion: then the drawer shows and hides, without sliding. */
function stillness(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A scrim's opacity for a drawer `at` of `width` open: a push drawer's only dims the page beside it. */
const dim = (at: number, width: number, push?: RefObject<HTMLElement | null>) => (at / Math.max(1, width)) * (push ? 0.4 : 1)

/** The page beside a push drawer, `px` across (with the drawer), over `ms` (0: as the finger has it). */
function shift(push: RefObject<HTMLElement | null> | undefined, px: number, ms: number, ease = LAND_EASE) {
  const el = push?.current
  if (!el) return
  el.style.willChange = 'transform' // on its layer through the landing too: let go when it is there (`settle`)
  el.style.transition = ms && !stillness() ? `transform ${ms}ms ${ease}` : 'none'
  el.style.transform = px > 0 ? `translateX(${px}px)` : ''
}

/** The page beside a push drawer, once landed: off its own layer again. */
function settle(push: RefObject<HTMLElement | null> | undefined) {
  if (push?.current) push.current.style.willChange = ''
}

/** While `active` (the drawer shut), the `Pull` that opens it with the finger, handed to `onPull` (null
 *  otherwise): the drawer and scrim follow it and, let go, it opens or goes back by how far and how fast. */
function usePullOpen(
  panel: RefObject<HTMLDivElement | null>,
  scrim: RefObject<HTMLDivElement | null>,
  active: boolean,
  open: () => void,
  onPull?: (pull: Pull | null) => void,
  push?: RefObject<HTMLElement | null>,
) {
  const opening = useRef(open)
  opening.current = open
  useEffect(() => {
    const el = panel.current
    const behind = scrim.current
    if (!active || !el || !behind || !onPull) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const place = (at: number, ms: number, ease = LAND_EASE) => {
      const width = Math.max(1, el.offsetWidth)
      const slide = ms && !stillness() ? ms : 0
      // `translate`, which its classes shut it with (a transform would add to that).
      el.style.willChange = 'translate'
      el.style.transition = slide ? `translate ${slide}ms ${ease}` : 'none'
      behind.style.transition = slide ? `opacity ${slide}ms ${ease}` : 'none'
      el.style.visibility = 'visible' // while pulled in by the finger, shut or not
      el.style.translate = `${at - width}px`
      behind.style.opacity = String(dim(at, width, push))
      shift(push, at, ms, ease)
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
        const { ms, ease } = landCurve(opened ? width - at : -at, speed) // the way left to go, as signed
        place(opened ? width : 0, ms, ease) // set off now, in this handler: no frame without movement
        // Then to where its classes put it (open, or shut), once it is there.
        timer = setTimeout(() => {
          el.style.transition = behind.style.transition = el.style.translate = el.style.visibility = behind.style.opacity = ''
          el.style.willChange = ''
          settle(push)
        }, ms + 50)
        if (opened) afterFrame(() => opening.current()) // the render after the landing is under way
      },
    })
    return () => onPull(null)
  }, [panel, scrim, active, onPull, push])
}

/** While `active`, a swipe left on the drawer or its scrim drags the drawer with the finger, and let go,
 *  closes it or puts it back by how far and how fast it went. A swipe right, or one that starts on a list
 *  row that swipes itself (`data-swipe-row`: a swipe left there shows its actions), is left to what is
 *  under it. */
function useSwipeClose(
  panel: RefObject<HTMLDivElement | null>,
  scrim: RefObject<HTMLDivElement | null>,
  active: boolean,
  close: () => void,
  push?: RefObject<HTMLElement | null>,
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
      const leave = e.touches.length !== 1 || !t || (e.target instanceof Element && e.target.closest('[data-swipe-row]'))
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
      // `translate`, the property its classes shut it with: landed shut, they take over with no jump.
      el.style.willChange = 'translate'
      el.style.transition = behind.style.transition = 'none'
      el.style.translate = `${g.at}px`
      behind.style.opacity = String(dim(el.offsetWidth + g.at, el.offsetWidth, push))
      shift(push, el.offsetWidth + g.at, 0)
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
      const curve = landCurve(shut ? -(width + swipe.at) : -swipe.at, speed) // the way left to go, signed
      const ms = stillness() ? 0 : curve.ms
      // Set off now, in this handler, the drawer and the page beside it on the same curve.
      el.style.transition = ms ? `translate ${ms}ms ${curve.ease}` : 'none'
      behind.style.transition = ms ? `opacity ${ms}ms ${curve.ease}` : 'none'
      shift(push, shut ? 0 : width, Math.max(ms, 1), curve.ease)
      el.style.translate = `${shut ? -width : 0}px` // where its classes will put it (shut: -100%)
      behind.style.opacity = shut ? '0' : ''
      clearTimeout(timer)
      timer = setTimeout(() => {
        el.style.transition = behind.style.transition = el.style.translate = behind.style.opacity = ''
        el.style.willChange = ''
        settle(push)
      }, ms + 50)
      if (shut) afterFrame(() => closing.current()) // the render after the landing is under way
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
      // A landing under way finishes on its own (its timer tidies up); otherwise nothing is left set.
      if (!el.style.transition || el.style.transition === 'none') el.style.translate = behind.style.opacity = ''
    }
  }, [panel, scrim, active, push])
}
