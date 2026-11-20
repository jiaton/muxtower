import {
  DndContext,
  DragOverlay,
  defaultDropAnimation,
  useDndMonitor,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { sortLook, useReducedMotion, useSortSensors } from '@/components/ui/sortable'
import { cn } from '@/lib/cn'
import { keptOrder } from '../model/project-order'

/** The owner's order of projects (kept on the hub) and how a new one is kept. */
export interface ProjectOrdering {
  stored: readonly string[]
  save: (projects: string[]) => void
}

/** What a project's header gets to be put in order: its ⋮⋮ handle (a mouse, the keyboard), what its fold
 *  button takes (a held finger; the click a drop ends with is no fold), and Move up / Move down (none at an end). */
export interface HeaderSort {
  handle: Record<string, unknown> & { ref: (el: HTMLElement | null) => void; label: string }
  hold: {
    onTouchStart?: (e: TouchEvent) => void
    onContextMenu: (e: MouseEvent) => void
    onClickCapture: (e: MouseEvent) => void
    className: string
  }
  up?: () => void
  down?: () => void
}

/** A click this soon after a drop is the drop's own (a finger let go on the header), not a fold. */
const DROP_CLICK_MS = 400

/**
 * The project groups of the list, put in order by hand (dnd-kit's sortable, one axis): a group's header is
 * picked up by its ⋮⋮ handle (a mouse; Space, the arrows and Space from the keyboard, announced) or held on a
 * touch screen, and the groups it passes slide aside (not with reduced motion); the list scrolls near its
 * edges. Nothing else listens: a wheel or a swipe over a header scrolls the list as ever. `ids` are the
 * project groups' keys as shown; a drop keeps the order on the hub (`keptOrder`).
 */
export function ProjectSort({
  ids,
  labelOf,
  ordering,
  overlay,
  children,
}: {
  ids: string[]
  labelOf: (id: string) => string
  ordering: ProjectOrdering
  overlay: (id: string) => ReactNode
  children: ReactNode
}) {
  const sensors = useSortSensors()
  const still = useReducedMotion()
  const [lifted, setLifted] = useState<string | null>(null)
  const wandered = useRef(false)
  const at = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1
  const name = (id: UniqueIdentifier) => labelOf(String(id))
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, project ${at(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) => {
      // Over itself as it is picked up: the pick-up is what is said.
      if (over && over.id !== active.id) wandered.current = true
      return over && wandered.current ? `${name(active.id)} moved to place ${at(over.id)} of ${ids.length}.` : undefined
    },
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} put at place ${at(over.id)} of ${ids.length}.` : `${name(active.id)} put back.`,
    onDragCancel: ({ active }) => `${name(active.id)} put back where it was.`,
  }
  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 10 }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move a project, press Space, then the up and down arrows, then Space to put it down, or Escape to put it back.',
        },
      }}
      onDragStart={(e: DragStartEvent) => {
        setLifted(String(e.active.id))
        wandered.current = false
        if (typeof window.TouchEvent !== 'undefined' && e.activatorEvent instanceof window.TouchEvent) navigator.vibrate?.(10)
      }}
      onDragCancel={() => setLifted(null)}
      onDragEnd={(e: DragEndEvent) => {
        setLifted(null)
        if (!e.over || e.active.id === e.over.id) return
        const moved = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
        ordering.save(keptOrder(ordering.stored, moved.map(labelOf)))
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay dropAnimation={still ? null : defaultDropAnimation}>
        {lifted ? <div className={sortLook.lifted}>{overlay(lifted)}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

/** A project's group in the sortable list: it slides as another passes, stays faint where it was while it is
 *  in hand, and hands its header what it is moved by (`HeaderSort`). */
export function SortableGroup({
  id,
  label,
  ids,
  ordering,
  labelOf,
  children,
}: {
  id: string
  label: string
  ids: string[]
  ordering: ProjectOrdering
  labelOf: (id: string) => string
  children: (sort: HeaderSort) => ReactNode
}) {
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
  const at = ids.indexOf(id)
  const step = (by: -1 | 1) => () => ordering.save(keptOrder(ordering.stored, arrayMove(ids, at, at + by).map(labelOf)))
  const sort: HeaderSort = {
    handle: { ...attributes, ...listeners, ref: setActivatorNodeRef, label: `Move ${label}` },
    hold: {
      onTouchStart: listeners?.onTouchStart as ((e: TouchEvent) => void) | undefined,
      onContextMenu: (e) => {
        // A held finger is a pick-up here, not the browser's menu.
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch') e.preventDefault()
      },
      onClickCapture: (e) => {
        if (performance.now() - dropped.current > DROP_CLICK_MS) return
        e.preventDefault()
        e.stopPropagation()
      },
      className: sortLook.hold,
    },
    up: at > 0 ? step(-1) : undefined,
    down: at >= 0 && at < ids.length - 1 ? step(1) : undefined,
  }
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn('group/sort', isDragging && sortLook.from)}
      style={{ transform: DndCSS.Translate.toString(transform), transition: still ? undefined : transition }}
    >
      {children(sort)}
    </section>
  )
}

/** A project header's "⋯": Move up and Move down, the way to put it in order without dragging. */
export function ProjectMoveMenu({ label, sort }: { label: string; sort: HeaderSort }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="shrink-0" aria-label={`More for ${label}`} title={`More for ${label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={ArrowUp} disabled={!sort.up} onSelect={sort.up}>
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem icon={ArrowDown} disabled={!sort.down} onSelect={sort.down}>
          Move down
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
