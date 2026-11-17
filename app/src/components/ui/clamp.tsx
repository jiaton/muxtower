import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'
import { fadeOut } from './intents'
import { cn } from '@/lib/cn'

/**
 * Long text shown short: at most `lines` lines tall (measured as drawn, so wrapping and CJK count as they
 * look), faded at the cut, with Show more / Show less. Clamped from the first paint, so nothing jumps:
 * whether it is cut is read after, from its height. Everything stays in the page: copying it, selecting
 * into the cut-off part or the browser's find landing there opens it. Open or not lives here, per message
 * and view (not kept); `open`: shown whole from the start (a search led to it).
 */
export function Clamp({ lines = 8, open: start = false, children }: { lines?: number; open?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState(false)
  const [open, setOpen] = useState(start)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [open, children])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open || !cut) return
    // Find in page scrolls the clamped box to its hit; a selection reaching in from it: open it.
    const reveal = () => el.scrollTop > 0 && ((el.scrollTop = 0), setOpen(true))
    const selected = () => {
      const s = document.getSelection()
      if (s && !s.isCollapsed && s.rangeCount && s.getRangeAt(0).intersectsNode(el)) {
        const box = el.getBoundingClientRect()
        const end = s.getRangeAt(0).getBoundingClientRect()
        if (end.bottom > box.bottom - 4) setOpen(true)
      }
    }
    el.addEventListener('scroll', reveal)
    document.addEventListener('selectionchange', selected)
    return () => {
      el.removeEventListener('scroll', reveal)
      document.removeEventListener('selectionchange', selected)
    }
  }, [open, cut])

  return (
    <div className="flex flex-col">
      <div
        ref={ref}
        data-clamped={!open && cut ? '' : undefined}
        className={cn(!open && 'overflow-hidden', !open && cut && fadeOut)}
        style={open ? undefined : { maxHeight: `${lines}lh` }}
      >
        {children}
      </div>
      {cut || open ? (
        <Button
          variant="plain"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-1 self-start text-sm font-medium underline-offset-2 hover:underline"
        >
          {open ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
    </div>
  )
}
