import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { axisOf, holdScroll, LAND_EASE, landing, landMs, Speed } from './gesture'

const OVERDRAG_PX = 24

type Gesture = { x: number; y: number; dx: number; from: number; axis?: 'x' | 'y'; speed: Speed }

/** A list row that a finger can swipe left to reveal `actions` on its right (like a mail app). A
 *  vertical move scrolls as usual; once a swipe, a finger drifting up or down keeps it a swipe, and let
 *  go, it opens or closes by how far and how fast it went (a short flick is enough). A tap on the row
 *  while it is open closes it instead of opening the row; pressing anywhere else closes it too. An open
 *  row says so (`data-swipe-open`), for a swipe around it (a drawer's) to leave it to the row. Mice and
 *  keyboards do not swipe: give them another way to the same actions (a menu). A swipe right on a closed
 *  row is not the row's: it is left to what is around it (the list's, which pulls the sidebar). */
export function SwipeActions({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const swiped = useRef(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [slide, setSlide] = useState(landMs(Infinity))
  const open = offset < 0 && !dragging
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

  /** The row `dx` across from where the gesture began, as the finger has it. */
  const follow = (g: Gesture, dx: number) => setOffset(Math.min(0, Math.max(-width() - OVERDRAG_PX, g.from + dx)))

  const end = (e: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    const lifted = e.type === 'pointerup' // a cancel may carry no position: the last move's then
    const dx = lifted ? e.clientX - g.x : g.dx
    if (lifted) g.speed.add(e.clientX)
    if (!g.axis && lifted && axisOf(dx, e.clientY - g.y) === 'x' && (dx < 0 || g.from < 0)) {
      g.axis = 'x' // a flick so quick that its only move is the lift
      swiped.current = true
      follow(g, dx)
    }
    if (g.axis !== 'x') return
    setDragging(false)
    const speed = g.speed.get()
    const at = Math.min(0, g.from + dx)
    const to = landing(at, speed, dx) < -width() / 2 ? -width() : 0
    setSlide(landMs(to - at, speed))
    setOffset(to)
  }

  return (
    <div ref={root} className="relative overflow-hidden" data-swipe-open={open || undefined}>
      <div
        ref={tray}
        className={cn('absolute inset-y-0 right-0 flex', !offset && 'invisible')} // closed: nothing shows past the row as it moves
        aria-hidden={!open}
        inert={!open}
        onClick={() => {
          setSlide(landMs(Infinity))
          setOffset(0) // an action ran: close
        }}
      >
        {actions}
      </div>
      <div
        ref={row}
        className="relative touch-pan-y bg-bg"
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? undefined : `transform ${slide}ms ${LAND_EASE}`,
        }}
        onPointerDown={(e) => {
          swiped.current = false
          if (e.pointerType === 'mouse') return
          gesture.current = { x: e.clientX, y: e.clientY, dx: 0, from: offset, speed: new Speed() }
          gesture.current.speed.add(e.clientX) // from the first touch: a short flick has few moves
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g) return
          const dx = (g.dx = e.clientX - g.x)
          g.speed.add(e.clientX)
          if (!g.axis) {
            g.axis = axisOf(dx, e.clientY - g.y)
            if (g.axis !== 'x') return
            if (dx > 0 && g.from === 0) {
              gesture.current = null // a swipe right on a closed row: the list's (the sidebar), not the row's
              return
            }
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }
          if (g.axis !== 'x') return
          swiped.current = true
          follow(g, dx)
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (!swiped.current && offset === 0) return
          e.preventDefault() // the end of a swipe, or a tap that closes the tray, is not a click on the row
          e.stopPropagation()
          if (!swiped.current) {
            setSlide(landMs(Infinity))
            setOffset(0)
          }
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
