import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Button } from './button'
import { Dialog, DialogContent } from './dialog'
import { ink } from './intents'

const SWIPE_PX = 50 // a sideways move this far, let go: the next or the previous picture
const DOUBLE_TAP_MS = 300
const ZOOM = 2

/**
 * Pictures shown large, one at a time, in a dialog: `count` of them, `index` the one shown, each drawn by
 * `slide(i)`. ←/→ (and the arrows on screen with a mouse) or a swipe go to the previous or next, "3 / 7"
 * says where; a double tap (or double click) zooms in, and the zoomed picture follows a drag; Esc or a tap
 * outside closes. Its pointer events stay in it: a swipe here never turns the page's views or goes back.
 */
export function ImageViewer({
  count,
  index,
  onIndexChange,
  onClose,
  title,
  description,
  slide,
}: {
  count: number
  index: number | null // null: closed
  onIndexChange: (index: number) => void
  onClose: () => void
  title: (index: number) => string
  description?: (index: number) => ReactNode
  slide: (index: number) => ReactNode
}) {
  const open = index !== null && count > 0
  const at = Math.min(Math.max(index ?? 0, 0), Math.max(count - 1, 0))
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const gesture = useRef<{ x: number; y: number; dx: number; dy: number; from: { x: number; y: number } } | null>(null)
  const lastTap = useRef(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const go = (by: number) => {
    const next = at + by
    if (next < 0 || next >= count) return
    setZoom(null)
    setPan({ x: 0, y: 0 })
    onIndexChange(next)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    gesture.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, from: pan }
  }
  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const g = gesture.current
    if (!g) return
    g.dx = e.clientX - g.x
    g.dy = e.clientY - g.y
    if (zoom) setPan({ x: g.from.x + g.dx, y: g.from.y + g.dy })
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const g = gesture.current
    gesture.current = null
    if (!g) return
    const tapped = Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8
    if (tapped) {
      const now = Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        const box = e.currentTarget.getBoundingClientRect()
        setZoom(zoom ? null : { x: e.clientX - box.left, y: e.clientY - box.top })
        setPan({ x: 0, y: 0 })
        lastTap.current = 0
      } else lastTap.current = now
      return
    }
    if (!zoom && Math.abs(g.dx) > SWIPE_PX && Math.abs(g.dx) > Math.abs(g.dy)) go(g.dx < 0 ? 1 : -1)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : (setZoom(null), onClose()))}>
      {open ? (
        <DialogContent
          title={title(at)}
          description={description?.(at)}
          className="sm:max-w-5xl"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') (e.preventDefault(), go(1))
            else if (e.key === 'ArrowLeft') (e.preventDefault(), go(-1))
          }}
        >
          <div className="relative flex min-h-0 items-center justify-center">
            <div
              data-testid="image-stage"
              className="flex max-h-[70dvh] w-full touch-none items-center justify-center overflow-hidden select-none"
              onPointerDown={down}
              onPointerMove={moveTo}
              onPointerUp={up}
              onPointerCancel={() => (gesture.current = null)}
            >
              <div
                className="flex max-h-[70dvh] max-w-full items-center justify-center transition-transform duration-150 motion-reduce:transition-none [&_img]:max-h-[70dvh] [&_img]:max-w-full [&_img]:object-contain"
                style={
                  zoom
                    ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${ZOOM})`, transformOrigin: `${zoom.x}px ${zoom.y}px` }
                    : undefined
                }
              >
                {slide(at)}
              </div>
            </div>
            {count > 1 ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Previous picture"
                  disabled={at === 0}
                  onClick={() => go(-1)}
                  className="absolute left-1 hidden pointer-fine:inline-flex"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Next picture"
                  disabled={at === count - 1}
                  onClick={() => go(1)}
                  className="absolute right-1 hidden pointer-fine:inline-flex"
                >
                  <ChevronRight />
                </Button>
              </>
            ) : null}
          </div>
          {count > 1 ? (
            <p className={`${ink.meta} ${ink.count} text-center`} aria-live="polite">
              {at + 1} / {count}
            </p>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
