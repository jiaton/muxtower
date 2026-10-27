import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, landing, Speed } from './gesture'

const OVERDRAG_PX = 24

/** A list row that a finger can swipe right to reveal `actions` on its left (like a mail app). A
 *  vertical move scrolls as usual; once a swipe, a finger drifting up or down keeps it a swipe, and let
 *  go, it opens or closes by how far and how fast it went. A tap on the row while it is open closes it
 *  instead of opening the row; pressing anywhere else closes it too. Mice and keyboards do not swipe:
 *  give them another way to the same actions (a menu). */
export function SwipeActions({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; from: number; axis?: 'x' | 'y'; speed: Speed } | null>(null)
  const swiped = useRef(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const open = offset > 0 && !dragging
  const width = () => tray.current?.offsetWidth ?? 0

  useEffect(() => holdScroll(row.current!, () => gesture.current?.axis === 'x'), [])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOffset(0)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const end = (cancelled: boolean) => {
    const g = gesture.current
    gesture.current = null
    if (g?.axis !== 'x') return
    setDragging(false)
    const speed = cancelled ? 0 : g.speed.get()
    setOffset((o) => (landing(o, speed) > width() / 2 ? width() : 0))
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
        ref={row}
        className={cn('relative touch-pan-y bg-bg', !dragging && 'transition-transform duration-200 ease-out')}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(e) => {
          swiped.current = false
          if (e.pointerType !== 'mouse') gesture.current = { x: e.clientX, y: e.clientY, from: offset, speed: new Speed() }
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g) return
          const dx = e.clientX - g.x
          if (!g.axis) {
            g.axis = axisOf(dx, e.clientY - g.y)
            if (g.axis !== 'x') return
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }
          if (g.axis !== 'x') return
          swiped.current = true
          g.speed.add(e.clientX)
          setOffset(Math.max(0, Math.min(width() + OVERDRAG_PX, g.from + dx)))
        }}
        onPointerUp={() => end(false)}
        onPointerCancel={() => end(true)}
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
