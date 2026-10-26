import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

const START_PX = 8 // how far a finger moves before the gesture counts as a swipe or a scroll
const OVERDRAG_PX = 24

/** A list row that a finger can swipe right to reveal `actions` on its left (like a mail app). A
 *  vertical move scrolls as usual; a tap on the row while it is open closes it instead of opening the
 *  row; pressing anywhere else closes it too. Mice and keyboards do not swipe: give them another way to
 *  the same actions (a menu). */
export function SwipeActions({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; from: number; axis?: 'x' | 'y' } | null>(null)
  const swiped = useRef(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const open = offset > 0 && !dragging
  const width = () => tray.current?.offsetWidth ?? 0

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOffset(0)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const end = () => {
    const g = gesture.current
    gesture.current = null
    if (g?.axis !== 'x') return
    setDragging(false)
    setOffset((o) => (o > width() / 2 ? width() : 0))
  }

  return (
    <div ref={root} className="relative overflow-hidden">
      <div
        ref={tray}
        className={cn('absolute inset-y-0 left-0 flex', !offset && 'invisible')} // closed: nothing shows past the row as it moves
        aria-hidden={!open}
        inert={!open}
        onClick={() => setOffset(0)} // an action ran: close
      >
        {actions}
      </div>
      <div
        className={cn('relative touch-pan-y bg-bg', !dragging && 'transition-transform duration-200 ease-out')}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(e) => {
          swiped.current = false
          if (e.pointerType !== 'mouse') gesture.current = { x: e.clientX, y: e.clientY, from: offset }
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g) return
          const dx = e.clientX - g.x
          if (!g.axis) {
            const dy = e.clientY - g.y
            if (Math.max(Math.abs(dx), Math.abs(dy)) < START_PX) return
            g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
            if (g.axis === 'y') return
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }
          if (g.axis !== 'x') return
          swiped.current = true
          setOffset(Math.max(0, Math.min(width() + OVERDRAG_PX, g.from + dx)))
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (!swiped.current && offset === 0) return
          e.preventDefault() // the end of a swipe, or a tap that closes the tray, is not a click on the row
          e.stopPropagation()
          if (!swiped.current) setOffset(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}

const TONES = {
  accent: 'bg-accent text-accent-fg',
  neutral: 'bg-fg-muted text-bg',
  danger: 'bg-danger text-danger-fg',
} as const

/** One button of a swipe tray: an icon over a short label, colored by what it does. */
export function SwipeAction({
  icon: Icon,
  label,
  tone = 'neutral',
  onClick,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  tone?: keyof typeof TONES
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-16 flex-col items-center justify-center gap-1 text-xs font-medium', TONES[tone])}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </button>
  )
}
