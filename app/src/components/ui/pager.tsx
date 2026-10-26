import { Children, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

const EDGE_PX = 24 // how far a finger moves right, past the first page, to count as a swipe out
const SETTLE_MS = 80

/**
 * Pages side by side, swiped between with the browser's own scrolling (it follows the finger and snaps,
 * with its momentum), one page wide each. `index` is the page shown: changing it scrolls there, and a
 * swipe that settles on another page reports it (`onIndexChange`). A swipe to the right on the first page
 * has nowhere to go: `onPastStart` (e.g. open a drawer). A page that scrolls sideways itself (wide output)
 * takes the swipe until it reaches its edge, as nested scrolling does.
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
  const shown = useRef(index)
  // Callbacks by ref: a page that renders often (live output) must not restart the listeners mid-swipe.
  const changed = useRef(onIndexChange)
  const pastStart = useRef(onPastStart)
  changed.current = onIndexChange
  pastStart.current = onPastStart
  const swipesOut = Boolean(onPastStart)
  const pages = Children.toArray(children)

  // Show `index`: at once the first time, then sliding.
  const placed = useRef(false)
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !el.clientWidth) return
    if (Math.round(el.scrollLeft / el.clientWidth) === index && placed.current) return
    shown.current = index
    el.scrollTo({ left: index * el.clientWidth, behavior: placed.current ? 'smooth' : 'instant' })
    placed.current = true
  }, [index])

  // The page a swipe settled on.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const settled = () => {
      const page = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      if (page !== shown.current) {
        shown.current = page
        changed.current?.(page)
      }
    }
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(settled, SETTLE_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Past the first page: touch events, since the browser's scrolling cancels pointer events mid-swipe.
  useEffect(() => {
    const el = root.current
    if (!el || !swipesOut) return
    let start: { x: number; y: number; left: number } | null = null
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, left: el.scrollLeft } : null
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.abs(dy) > Math.abs(dx)) start = null // scrolling up or down
      else if (dx > EDGE_PX && start.left <= 1 && !sideways(e.target, el)) {
        start = null
        pastStart.current?.()
      }
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
    }
  }, [swipesOut])

  return (
    <div
      ref={root}
      role={label ? 'region' : undefined}
      aria-label={label}
      className={cn('flex min-h-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]', className)}
    >
      {pages.map((page, i) => (
        <div key={i} className="flex min-h-0 w-full shrink-0 snap-start snap-always flex-col" aria-hidden={i !== index} inert={i !== index}>
          {page}
        </div>
      ))}
    </div>
  )
}

/** Whether the touch began on something that scrolls sideways itself and can still go left. */
function sideways(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && el.scrollLeft > 0) return true
  }
  return false
}
