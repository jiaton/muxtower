import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, LAND_EASE, landing, landMs, sideways, Speed, type Pull } from './gesture'

const RESIST = 0.3 // past the last page a swipe moves the pages this much per pixel
const WHEEL_PX = 60 // a trackpad's sideways scroll this far turns the page

type Gesture = {
  x: number
  y: number
  from: number
  at: number
  axis?: 'x' | 'y'
  speed: Speed
  /** Pulling what is past the first page: from this far across, and how far it came since. */
  pull?: { from: number; at: number }
}

/**
 * Pages side by side, one page wide each, swiped between: the pages follow a sideways finger and, let go,
 * land on the page its distance and speed point to, at once: that page is the one shown (and takes
 * taps) as it slides in, as fast as the finger went. `index` is the page shown: changing it slides there,
 * and a swipe that lands on another page reports it (`onIndexChange`). A swipe to the right on the first
 * page pulls in what is before it (`pastStart`, e.g. a drawer), with the finger, the pages staying put.
 * A page that scrolls sideways itself (wide output) takes the swipe while it can still scroll that way.
 */
export function Pager({
  index,
  onIndexChange,
  pastStart,
  label,
  className,
  children,
}: {
  index: number
  onIndexChange?: (index: number) => void
  pastStart?: Pull
  label?: string
  className?: string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const pages = Children.toArray(children)
  const [shown, setShown] = useState(index)
  const state = useRef({ shown, count: pages.length })
  state.current = { shown, count: pages.length }
  // Callbacks by ref: a page that renders often (live output) must not restart the listeners mid-swipe.
  const changed = useRef(onIndexChange)
  const pull = useRef(pastStart)
  changed.current = onIndexChange
  pull.current = pastStart

  useEffect(() => setShown(index), [index])

  /** The pages `px` off the page shown, sliding there in `ms` (0: at once). */
  const place = useRef((px: number, ms: number) => {
    const el = track.current
    if (!el) return
    el.style.transition = ms ? `transform ${ms}ms ${LAND_EASE}` : 'none'
    el.style.transform = `translateX(calc(${-state.current.shown * 100}% + ${px}px))`
  })

  // The page shown: at once the first time, then sliding (as fast as the swipe that turned it).
  const placed = useRef(false)
  const slide = useRef(landMs(Infinity))
  useLayoutEffect(() => {
    place.current(0, placed.current ? slide.current : 0)
    placed.current = true
    slide.current = landMs(Infinity)
  }, [shown])

  /** To page `to`, from `at` px off the page shown, moving at `speed`. */
  const turn = useRef((to: number, at = 0, speed = 0) => {
    const { shown: from, count } = state.current
    const page = Math.max(0, Math.min(count - 1, to))
    slide.current = landMs(at + (page - from) * (root.current?.clientWidth ?? 0), speed) // the way left to go
    if (page === from) return place.current(0, slide.current)
    state.current.shown = page
    setShown(page)
    changed.current?.(page)
  })

  // A finger: touch events, which a page's own scrolling does not cancel the way it cancels pointers.
  const gesture = useRef<Gesture | null>(null)
  useEffect(() => {
    const el = root.current!
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      gesture.current = null
      if (e.touches.length !== 1 || !t) return
      gesture.current = { x: t.clientX, y: t.clientY, from: 0, at: 0, speed: new Speed() }
      gesture.current.speed.add(t.clientX) // from the first touch: a short flick has few moves
    }
    const move = (e: TouchEvent) => {
      const g = gesture.current
      const t = e.touches[0]
      if (!g || !t) return
      const dx = t.clientX - g.x
      g.speed.add(t.clientX)
      if (!g.axis) {
        g.axis = axisOf(dx, t.clientY - g.y)
        if (!g.axis) return
        if (g.axis === 'x' && sideways(e.target, el, dx)) g.axis = 'y' // that page scrolls it
        if (g.axis === 'y') return
        g.from = offset(track.current, el.clientWidth, state.current.shown) // caught mid-slide: from there
      }
      if (g.axis !== 'x') return
      const { shown: page, count } = state.current
      if (page === 0 && pull.current && (g.pull || g.from + dx > 0)) {
        if (!g.pull) {
          g.pull = { from: dx, at: 0 } // the drawer starts from where the finger is now
          place.current(0, 0)
        }
        g.pull.at = Math.max(0, dx - g.pull.from)
        pull.current.move(g.pull.at)
        return
      }
      const raw = g.from + dx
      const width = el.clientWidth
      const min = -(count - 1 - page) * width
      const max = page * width
      g.at = raw > max ? max + (raw - max) * RESIST : raw < min ? min + (raw - min) * RESIST : raw
      place.current(g.at, 0)
    }
    const up = (e: TouchEvent) => {
      const g = gesture.current
      gesture.current = null
      if (g?.axis !== 'x') return
      const t = e.changedTouches[0]
      if (t) g.speed.add(t.clientX)
      const speed = g.speed.get()
      if (g.pull) return pull.current?.end(g.pull.at, speed)
      const to = landing(g.at, speed, g.at - g.from)
      const pages = Math.min(1, Math.round(Math.abs(to) / Math.max(1, el.clientWidth)))
      turn.current(state.current.shown - Math.sign(to) * pages, g.at, speed)
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    const release = holdScroll(el, () => gesture.current?.axis === 'x') // after `move`: from the move that tells
    return () => {
      release()
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [])

  // A trackpad's sideways scroll, a page at a time.
  useEffect(() => {
    const el = root.current!
    let sum = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || sideways(e.target, el, -e.deltaX)) return
      e.preventDefault()
      clearTimeout(timer)
      timer = setTimeout(() => (sum = 0), 200) // one scroll, until it stops
      if (sum === Infinity) return // this scroll turned the page already
      sum += e.deltaX
      if (Math.abs(sum) < WHEEL_PX) return
      turn.current(state.current.shown + Math.sign(sum))
      sum = Infinity
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      clearTimeout(timer)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  return (
    <div ref={root} role={label ? 'region' : undefined} aria-label={label} className={cn('flex min-h-0 overflow-clip', className)}>
      <div ref={track} className="flex min-h-0 w-full flex-1">
        {pages.map((page, i) => (
          <div key={i} className="flex min-h-0 w-full shrink-0 flex-col" aria-hidden={i !== shown} inert={i !== shown}>
            {page}
          </div>
        ))}
      </div>
    </div>
  )
}

/** How far the pages are off the page shown right now (mid-slide, part of the way). */
function offset(track: HTMLElement | null, width: number, shown: number): number {
  const transform = track ? getComputedStyle(track).transform : ''
  if (!transform || transform === 'none' || typeof DOMMatrix === 'undefined') return 0
  return new DOMMatrix(transform).m41 + shown * width
}
