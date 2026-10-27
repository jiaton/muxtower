import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, landing, Speed } from './gesture'

const EDGE_PX = 24 // how far a finger moves right, past the first page, to count as a swipe out
const LAND = 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)' // quick to start, soft to stop
const RESIST = 0.3 // past the last page a swipe moves the pages this much per pixel
const WHEEL_PX = 60 // a trackpad's sideways scroll this far turns the page

type Gesture = { x: number; y: number; from: number; at: number; axis?: 'x' | 'y'; speed: Speed }

/**
 * Pages side by side, one page wide each, swiped between: the pages follow a sideways finger and, let go,
 * land on the page its distance and speed point to, at once: that page is the one shown (and takes
 * taps) as it slides in. `index` is the page shown: changing it slides there, and a swipe that lands on
 * another page reports it (`onIndexChange`). A swipe to the right on the first page has nowhere to go:
 * `onPastStart` (e.g. open a drawer). A page that scrolls sideways itself (wide output) takes the swipe
 * while it can still scroll that way.
 */
export function Pager({
  index,
  onIndexChange,
  onPastStart,
  label,
  className,
  children,
}: {
  index: number
  onIndexChange?: (index: number) => void
  onPastStart?: () => void
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
  const pastStart = useRef(onPastStart)
  changed.current = onIndexChange
  pastStart.current = onPastStart

  useEffect(() => setShown(index), [index])

  /** The pages `px` off the page shown, sliding there or (`land` false) at once. */
  const place = useRef((px: number, land: boolean) => {
    const el = track.current
    if (!el) return
    el.style.transition = land ? LAND : 'none'
    el.style.transform = `translateX(calc(${-state.current.shown * 100}% + ${px}px))`
  })

  // The page shown: at once the first time, then sliding.
  const placed = useRef(false)
  useLayoutEffect(() => {
    place.current(0, placed.current)
    placed.current = true
  }, [shown])

  const turn = useRef((to: number) => {
    const { shown: from, count } = state.current
    const page = Math.max(0, Math.min(count - 1, to))
    if (page === from) return place.current(0, true)
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
      gesture.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, from: 0, at: 0, speed: new Speed() } : null
    }
    const move = (e: TouchEvent) => {
      const g = gesture.current
      const t = e.touches[0]
      if (!g || !t) return
      const dx = t.clientX - g.x
      if (!g.axis) {
        g.axis = axisOf(dx, t.clientY - g.y)
        if (!g.axis) return
        if (g.axis === 'x' && sideways(e.target, el, dx)) g.axis = 'y' // that page scrolls it
        if (g.axis === 'y') return
        g.from = offset(track.current, el.clientWidth, state.current.shown) // caught mid-slide: from there
      }
      if (g.axis !== 'x') return
      const { shown: page, count } = state.current
      if (page === 0 && pastStart.current && g.from + dx > 0) {
        if (dx > EDGE_PX) {
          gesture.current = null
          place.current(0, true)
          pastStart.current()
        }
        return
      }
      const raw = g.from + dx
      const width = el.clientWidth
      const min = -(count - 1 - page) * width
      const max = page * width
      g.at = raw > max ? max + (raw - max) * RESIST : raw < min ? min + (raw - min) * RESIST : raw
      g.speed.add(t.clientX)
      place.current(g.at, false)
    }
    const up = (cancelled: boolean) => () => {
      const g = gesture.current
      gesture.current = null
      if (g?.axis !== 'x') return
      const width = Math.max(1, el.clientWidth)
      const to = landing(g.at, cancelled ? 0 : g.speed.get())
      turn.current(state.current.shown - Math.sign(to) * Math.min(1, Math.round(Math.abs(to) / width)))
    }
    const ended = up(false)
    const cancelled = up(true)
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', ended)
    el.addEventListener('touchcancel', cancelled)
    const release = holdScroll(el, () => gesture.current?.axis === 'x') // after `move`: from the move that tells
    return () => {
      release()
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', ended)
      el.removeEventListener('touchcancel', cancelled)
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

/** Whether the touch began on something that scrolls sideways itself and can still go the way of `dx`
 *  (a finger moving right scrolls toward the start). */
function sideways(target: EventTarget | null, root: HTMLElement, dx: number): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1 || !/auto|scroll/.test(getComputedStyle(el).overflowX)) continue
    if (dx > 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
  }
  return false
}
