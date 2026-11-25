import { KeyboardSensor, MouseSensor, TouchSensor, useDndMonitor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type MouseEvent, type TouchEvent } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { HOLD_MS, MOVE_PX } from './press'

/** A mouse moved this far on a handle is dragging (less is a click). */
const DRAG_PX = 4

/**
 * dnd-kit's sensors for a list put in order by hand: a mouse on a handle once it moves a few pixels; a finger
 * after it is held still as long as a press is held to repeat (`HOLD_MS`, `MOVE_PX` of `press.ts`), so a swipe
 * that starts there scrolls as ever (it moved first: the hold is let go, nothing prevented); the keyboard with
 * Space to pick up, the arrows, Space to put down, Escape to put back (Enter stays the control's own).
 */
export function useSortSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: MOVE_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
}

/** Whether the reader asked for less motion: then nothing slides, lifts or drops. */
export function useReducedMotion(): boolean {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduce, setReduce] = useState(Boolean(query?.matches))
  useEffect(() => {
    if (!query) return
    const change = () => setReduce(query.matches)
    query.addEventListener?.('change', change)
    return () => query.removeEventListener?.('change', change)
  }, [query])
  return reduce
}

/** A sortable header: where it stood while lifted (faint), the one in hand (over the rest, a shadow), and
 *  never the browser's own callout on a held finger. Not `lifted` (intents): that is a round chip, scaled. */
export const sortLook = {
  hold: '[-webkit-touch-callout:none]',
  from: 'opacity-30',
  lifted: 'cursor-grabbing shadow-card',
}

/**
 * The ⋮⋮ handle a row is dragged by with a mouse, and picked up by from the keyboard (dnd-kit's attributes
 * and listeners are spread on it). It sits in the left padding of its row (`absolute`: the row is positioned)
 * and shows while a mouse is over the row (`group/sort`) or it has the keyboard's focus; a finger, with no
 * hover, holds the row instead.
 */
export function DragHandle({ className, label, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <Button
      variant="plain"
      aria-label={label}
      title={label}
      className={cn(
        'absolute inset-y-0 left-0 flex w-3 cursor-grab items-center justify-center text-fg-muted opacity-0 group-hover/sort:opacity-100 focus-visible:opacity-100 sm:w-4 [&_svg]:size-3',
        className,
      )}
      {...props}
    >
      <GripVertical aria-hidden />
    </Button>
  )
}

/** A click this soon after a drop is the drop's own (a finger let go on the row), not a tap on it. */
const DROP_CLICK_MS = 400

/** What a row of a sortable list is moved by: its node, where it is now, its ⋮⋮ handle (a mouse, the keyboard),
 *  and what the whole row takes (`hold`: a finger held still on it picks it up; the click a drop ends with is
 *  swallowed; a held finger opens no browser menu). */
export interface SortableRow {
  ref: (el: HTMLElement | null) => void
  style: CSSProperties
  handle: Record<string, unknown> & { ref: (el: HTMLElement | null) => void }
  hold: {
    onTouchStart?: (e: TouchEvent) => void
    onContextMenu: (e: MouseEvent) => void
    onClickCapture: (e: MouseEvent) => void
  }
  dragging: boolean
}

/** One row of a list in a `DndContext` with `useSortSensors` (dnd-kit's sortable): it slides as another passes
 *  (not with reduced motion), and can be picked up by its handle or held anywhere on a touch screen. */
export function useSortableRow(id: string | number): SortableRow {
  const still = useReducedMotion()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: still ? null : undefined,
  })
  const dropped = useRef(0)
  useDndMonitor({
    onDragEnd: ({ active }) => void (active.id === id && (dropped.current = performance.now())),
    onDragCancel: ({ active }) => void (active.id === id && (dropped.current = performance.now())),
  })
  return {
    ref: setNodeRef,
    style: { transform: DndCSS.Translate.toString(transform), transition: still ? undefined : transition },
    handle: { ...attributes, ...listeners, ref: setActivatorNodeRef },
    hold: {
      onTouchStart: listeners?.onTouchStart as ((e: TouchEvent) => void) | undefined,
      onContextMenu: (e) => {
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch') e.preventDefault()
      },
      onClickCapture: (e) => {
        if (performance.now() - dropped.current > DROP_CLICK_MS) return
        e.preventDefault()
        e.stopPropagation()
      },
    },
    dragging: isDragging,
  }
}
