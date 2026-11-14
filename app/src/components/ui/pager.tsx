import { Children, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, LAND_EASE, landMs, sideways, Speed, type Pull } from './gesture'

type Gesture = {
  x: number
  y: number
  axis?: 'x' | 'y'
  speed: Speed
  /** Pulling what is past the first page: from this far across, and how far it came since. */
  pull?: { from: number; at: number }
}

/**
 * Pages side by side, one page wide each; `index` is the page shown, and changing it slides there. They
 * are not swiped between (the owner's choice: a sideways swipe or a trackpad's sideways scroll is never a
 * page turn, so the browser's own back and forward swipe is never contested). A swipe to the right on the
 * first page still pulls in what is before it (`pastStart`, e.g. the list's drawer on a phone), with the
 * finger. A page that scrolls sideways itself (wide output) keeps its own swipe.
 */
export function Pager({
  index,
  pastStart,
  label,
  className,
  children,
}: {
  index: number
  pastStart?: Pull
  label?: string
  className?: string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const pages = Children.toArray(children)
  const shown = Math.max(0, Math.min(pages.length - 1, index))
  // By ref: a page that renders often (live output) must not restart the listeners mid-swipe.
  const pull = useRef(pastStart)
  pull.current = pastStart
  const first = useRef(shown === 0)
  first.current = shown === 0

  // The page shown: at once the first time, then sliding.
  const placed = useRef(false)
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const ms = placed.current ? landMs(Infinity) : 0
    el.style.transition = ms ? `transform ${ms}ms ${LAND_EASE}` : 'none'
    el.style.transform = `translateX(${-shown * 100}%)`
    placed.current = true
  }, [shown])

  // A finger pulling the drawer before the first page: touch events, which a page's own scrolling does
  // not cancel the way it cancels pointers.
  const gesture = useRef<Gesture | null>(null)
  useEffect(() => {
    const el = root.current!
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      gesture.current = null
      if (e.touches.length !== 1 || !t || !pull.current || !first.current) return
      gesture.current = { x: t.clientX, y: t.clientY, speed: new Speed() }
      gesture.current.speed.add(t.clientX) // from the first touch: a short flick has few moves
    }
    const move = (e: TouchEvent) => {
      const g = gesture.current
      const t = e.touches[0]
      if (!g || !t || !pull.current) return
      const dx = t.clientX - g.x
      g.speed.add(t.clientX)
      if (!g.axis) {
        g.axis = axisOf(dx, t.clientY - g.y)
        if (!g.axis) return
        // Only rightwards, and not where the page itself scrolls that way: everything else is the page's.
        if (g.axis === 'x' && (dx < 0 || sideways(e.target, el, dx))) g.axis = 'y'
        if (g.axis === 'y') return
        g.pull = { from: dx, at: 0 } // the drawer starts from where the finger is now
      }
      if (g.axis !== 'x' || !g.pull) return
      g.pull.at = Math.max(0, dx - g.pull.from)
      pull.current.move(g.pull.at)
    }
    const up = (e: TouchEvent) => {
      const g = gesture.current
      gesture.current = null
      if (g?.axis !== 'x' || !g.pull) return
      const t = e.changedTouches[0]
      if (t) g.speed.add(t.clientX)
      pull.current?.end(g.pull.at, g.speed.get())
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
