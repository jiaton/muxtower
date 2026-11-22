import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { reducedMotion, useWheelScrollsX } from './use-wheel-scrolls-x'

const PAGE = 0.8 // ‹ and › scroll this much of the row's width: a page, with a little of the last one still in view

/**
 * One row of things that scrolls sideways (chips), never wrapping. Its edges fade where there is more to
 * scroll, a mouse's vertical wheel scrolls it (`useWheelScrollsX`), and on a desktop ‹ and › show at its ends
 * on hover where there is more that way, each scrolling about a page. A finger just swipes it. `className`
 * lays out the scroller (its gap, its padding); `ref` is the scroller.
 */
export function ScrollRow({ ref, className, children }: { ref?: Ref<HTMLDivElement>; className?: string; children: ReactNode }) {
  const own = useRef<HTMLDivElement>(null)
  const more = useMoreToScroll(own)
  useWheelScrollsX(own)
  const setRef = (el: HTMLDivElement | null) => {
    own.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  const page = (way: -1 | 1) => {
    const el = own.current
    if (el) el.scrollBy({ left: way * el.clientWidth * PAGE, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }
  const arrow = 'invisible absolute top-1/2 z-10 -translate-y-1/2 group-hover/scroll-row:visible'
  return (
    <div className="group/scroll-row relative">
      <div
        ref={setRef}
        data-scroll-row=""
        data-more-start={more.start ? '' : undefined}
        data-more-end={more.end ? '' : undefined}
        className={cn('fade-edges-x flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      >
        {children}
      </div>
      {more.start ? (
        <Button
          variant="outline"
          size="icon-sm"
          round
          floating
          tabIndex={-1}
          aria-label="Scroll left"
          onClick={() => page(-1)}
          className={cn(arrow, 'left-1')}
        >
          <ChevronLeft aria-hidden />
        </Button>
      ) : null}
      {more.end ? (
        <Button
          variant="outline"
          size="icon-sm"
          round
          floating
          tabIndex={-1}
          aria-label="Scroll right"
          onClick={() => page(1)}
          className={cn(arrow, 'right-1')}
        >
          <ChevronRight aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

/** Whether a sideways scroller has more to show before and after what is in view: on scrolling, on a resize,
 *  and after each render (what it holds may have changed), then at the next frame: read during a commit, its
 *  width forced a layout of the whole page in the middle of a chip or session switch. */
function useMoreToScroll(ref: RefObject<HTMLElement | null>) {
  const [more, setMore] = useState({ start: false, end: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const start = max >= 1 && el.scrollLeft > 1
    const end = max >= 1 && el.scrollLeft < max - 1
    setMore((was) => (was.start === start && was.end === end ? was : { start, end }))
  }, [ref])
  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = measure
    el.addEventListener('scroll', update, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resize?.disconnect()
    }
  }, [ref, measure])
  return more
}
