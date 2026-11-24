import { Plus } from 'lucide-react'
import { useProjectOrder } from '../api/use-project-order'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimation,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import { newChipId, useSaveChipGroups } from '../api/use-chip-groups'
import { MAX_GROUPS, OTHER, projectChips, type ChipGroup, type ProjectChip } from '../model/chip-groups'
import { teamOf, teamProject, teamsOfGroup } from '../model/team'
import type { SessionEntry } from '../model/facets'
import { filterEntries, type SessionQuery } from '../model/query'
import type { ListSearch } from '../model/search'
import { ChipGroupDialog } from './chip-group-dialog'
import { Chip } from './list-chips'
import { TeamCard, TeamPanel } from './team-card'
import { Button } from '@/components/ui/button'
import { bleedRow } from '@/components/ui/list-row'
import { ScrollRow } from '@/components/ui/scroll-row'
import { chip } from '@/components/ui/chip'
import { lifted as liftedLook, liftedFrom } from '@/components/ui/intents'

/** Teams a group's menu lists before "More teams…". */
const TEAMS_SHOWN = 6

const DRAG_PX = 6 // a mouse moved this far is dragging, not clicking
const LIFT_MS = 250 // a finger held this long picks a chip up (before it, a swipe scrolls the row)
const LIFT_TOLERANCE_PX = 8 // ... and may wander this much meanwhile
const MENU_PX = 8 // a lifted chip let go within this: its menu, not a move

/**
 * The second chip row: the owner's groups of projects in their order (or, while there are none, the most
 * recently active projects), each with how many sessions of the chosen view it holds, then "+" for a new
 * group. A chip chosen again is let go. Groups are put in order by dragging them along the row (dnd-kit's
 * sortable: the others slide aside, the chip is lifted and dropped into place; a mouse past a few pixels, so
 * a click still chooses; a finger after a short hold, so a swipe still scrolls the row; Space, the arrows and
 * Space again, announced to screen readers; or Alt+←/→ on a focused chip). The row is a `ScrollRow`: a mouse's
 * wheel scrolls it, its edges fade where there is more, ‹ › on hover. A right click, or a held finger
 * let go without moving, offers its teams, Edit and Delete, under the chip it belongs to. Projects shown while there are no groups are in order of
 * activity, and do not move; "+" stays last. Not shown for a single project and no groups.
 */
export function ProjectChips({
  query,
  search,
  entries,
  groups,
  onChoose,
  className,
}: {
  query: SessionQuery
  search: ListSearch
  entries: SessionEntry[]
  groups: ChipGroup[]
  /** A chip clicked (`''`: let go): chooses it, and may open a session with it (`useChipSwitch`). */
  onChoose?: (event: MouseEvent, chip: string) => void
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const save = useSaveChipGroups()
  const [editing, setEditing] = useState<ChipGroup | 'new' | null>(null)
  const [menu, setMenu] = useState<{ group: ChipGroup; label: string; x: number; y: number } | null>(null)
  const [allTeams, setAllTeams] = useState(false)
  const [team, setTeam] = useState<{ project: string; x: number; y: number; open: boolean } | null>(null)
  const teams = menu ? teamsOfGroup(menu.group, entries) : []
  const chips = projectChips(groups, entries, useProjectOrder())

  useLayoutEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"]')
    if (!el || !chip) return
    // By its box, not offsetLeft: a chip with a team card sits in a positioned wrapper of its own.
    const left = chip.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
    const width = chip.getBoundingClientRect().width
    if (left < el.scrollLeft || left + width > el.scrollLeft + el.clientWidth) el.scrollLeft = left - el.clientWidth / 2 + width / 2
  }, [search.chip, chips?.length])

  const saveAll = (next: ChipGroup[], done?: () => void) => save.mutate(next, { onSuccess: done })
  const ids = groups.map((g) => g.id)
  const reorder = (order: string[]) => {
    if (order.join() !== ids.join()) saveAll(order.map((id) => groups.find((g) => g.id === id)!))
  }
  const openMenu = (id: string) => {
    const group = groups.find((g) => g.id === id)
    const el = row.current?.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(id)}"]`)
    const rect = el?.getBoundingClientRect()
    if (group && rect) setMenu({ group, label: group.name, x: rect.left, y: rect.bottom })
  }
  const still = useReducedMotion()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LIFT_MS, tolerance: LIFT_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] }, // Enter still chooses the chip
    }),
  )
  const [lifted, setLifted] = useState<string | null>(null)
  const dropped = useRef(false) // the click a drop makes chooses nothing

  if (!chips) return null
  const count = (chip: ProjectChip) => filterEntries(entries, { view: query.view, group: query.group, chip }).length
  const liftedChip = lifted ? chips.find((c) => c.id === lifted) : undefined

  return (
    <nav aria-label="Projects" data-component="projects row" data-own-swipe className={cn(bleedRow.outer, className)}>
      <ScrollRow ref={row} className={cn(bleedRow.inner, 'gap-1.5')}>
        <DndContext
          sensors={sensors}
          modifiers={[restrictToHorizontalAxis]}
          autoScroll={{ threshold: { x: 0.15, y: 0 }, acceleration: 8 }}
          onDragStart={(e: DragStartEvent) => {
            setLifted(String(e.active.id))
            if (typeof TouchEvent !== 'undefined' && e.activatorEvent instanceof TouchEvent) navigator.vibrate?.(10)
          }}
          onDragCancel={() => setLifted(null)}
          onDragEnd={(e: DragEndEvent) => {
            setLifted(null)
            const touch = typeof TouchEvent !== 'undefined' && e.activatorEvent instanceof TouchEvent
            if (touch && Math.hypot(e.delta.x, e.delta.y) < MENU_PX) return openMenu(String(e.active.id)) // held, not moved
            dropped.current = !(e.activatorEvent instanceof KeyboardEvent)
            if (e.over && e.active.id !== e.over.id) {
              reorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
            }
          }}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {chips.map((chip) => {
              const group = groups.find((g) => g.id === chip.id)
              const current = search.chip === chip.id
              const shown = (
                <Chip
                  search={search}
                  scope={{ chip: current ? '' : chip.id }}
                  current={current}
                  count={count(chip)}
                  onClick={(e) => onChoose?.(e, current ? '' : chip.id)}
                  className="[-webkit-touch-callout:none]"
                >
                  <span className="max-w-40 truncate">{chip.label}</span>
                </Chip>
              )
              return (
                <TeamCard
                  key={chip.id}
                  project={group || chip.projects[0] === OTHER ? null : teamProject(entries, chip.projects[0])}
                  entries={entries}
                >
                  {group ? (
                    <SortableChip
                      id={chip.id}
                      still={still}
                      onMenu={() => openMenu(chip.id)}
                      onStep={(by) => {
                        const at = ids.indexOf(chip.id)
                        if (at + by >= 0 && at + by < ids.length) reorder(arrayMove(ids, at, at + by))
                      }}
                      onClickCapture={(e) => {
                        if (dropped.current) e.preventDefault()
                        dropped.current = false
                      }}
                    >
                      {shown}
                    </SortableChip>
                  ) : (
                    <span data-chip-id={chip.id} className="inline-flex">
                      {shown}
                    </span>
                  )}
                </TeamCard>
              )
            })}
          </SortableContext>
          <DragOverlay dropAnimation={still ? null : defaultDropAnimation}>
            {liftedChip ? (
              <span className={cn('inline-flex', liftedLook)}>
                <Chip search={search} scope={{ chip: liftedChip.id }} current={search.chip === liftedChip.id} count={count(liftedChip)}>
                  <span className="max-w-40 truncate">{liftedChip.label}</span>
                </Chip>
              </span>
            ) : null}
          </DragOverlay>
        </DndContext>
        {groups.length < MAX_GROUPS ? (
          <Button
            variant="plain"
            aria-label="New group"
            title="New group"
            onClick={() => setEditing('new')}
            className={chip({ kind: 'add' })}
          >
            <Plus aria-hidden />
          </Button>
        ) : null}
      </ScrollRow>
      <DropdownMenu
        open={Boolean(menu)}
        onOpenChange={(open) => {
          if (open) return
          setMenu(null)
          setAllTeams(false)
        }}
      >
        <DropdownMenuTrigger asChild>
          <span aria-hidden tabIndex={-1} className="pointer-events-none fixed size-0" style={{ left: menu?.x, top: menu?.y }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={12}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()} // a long press's own click focuses the chip: no closing on it
        >
          {menu ? (
            <>
              <DropdownMenuLabel>{menu.label}</DropdownMenuLabel>
              {(allTeams ? teams : teams.slice(0, TEAMS_SHOWN)).map((project) => (
                <DropdownMenuItem key={project} onSelect={() => setTeam({ project, x: menu.x, y: menu.y, open: true })}>
                  Team · {project}
                </DropdownMenuItem>
              ))}
              {!allTeams && teams.length > TEAMS_SHOWN ? (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault() // the menu stays, with the rest
                    setAllTeams(true)
                  }}
                >
                  More teams…
                </DropdownMenuItem>
              ) : null}
              {teams.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => setEditing(menu.group)}>Edit</DropdownMenuItem>
              <DropdownMenuItem tone="danger" onSelect={() => saveAll(groups.filter((g) => g.id !== menu.group.id))}>
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {team ? (
        <TeamPanel
          project={team.project}
          members={teamOf(entries, team.project)}
          shown={team.open ? { pinned: true, x: team.x, y: team.y } : null}
          onClose={() => setTeam({ ...team, open: false })} // kept: its dialogs (Rename…) outlive the card
        />
      ) : null}
      {editing ? (
        <ChipGroupDialog
          group={editing === 'new' ? undefined : editing}
          entries={entries}
          error={save.error}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onRemove={(project) => {
            if (editing === 'new') return
            const stored = groups.find((g) => g.id === editing.id) ?? editing
            const kept = { ...stored, projects: stored.projects.filter((p) => p !== project) }
            setEditing({ ...editing, projects: editing.projects.filter((p) => p !== project) })
            saveAll(groups.map((g) => (g.id === kept.id ? kept : g)))
          }}
          onSave={(name, members) => {
            const next =
              editing === 'new'
                ? [...groups, { id: newChipId(), name, ...members }]
                : groups.map((g) => (g.id === editing.id ? { ...g, name, ...members } : g))
            saveAll(next, () => setEditing(null))
          }}
        />
      ) : null}
    </nav>
  )
}

/** Whether the reader asked for less motion: then nothing slides, lifts or drops. */
function useReducedMotion(): boolean {
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

/**
 * A group's chip in the sortable row: the others slide aside as it moves (unless the reader asked for less
 * motion), and where it stood stays faint while it is lifted (the lifted one is the overlay). Its link keeps
 * its role (dnd-kit's describe it as sortable); a right click opens its menu; Alt+←/→ moves it one place.
 */
function SortableChip({
  id,
  still,
  onMenu,
  onStep,
  onClickCapture,
  children,
}: {
  id: string
  still: boolean
  onMenu: () => void
  onStep: (by: -1 | 1) => void
  onClickCapture: (e: MouseEvent) => void
  children: ReactElement<Record<string, unknown>>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: still ? null : undefined,
  })
  const { role: _, ...described } = attributes // a link stays a link
  const keyDown = listeners?.onKeyDown as ((e: KeyboardEvent) => void) | undefined
  return (
    <span
      ref={setNodeRef}
      data-chip-id={id}
      className={cn('inline-flex', isDragging && liftedFrom)}
      style={{ transform: DndCSS.Translate.toString(transform), transition: still ? undefined : transition }}
      onClickCapture={onClickCapture}
    >
      {cloneElement(children, {
        ...described,
        ...listeners,
        draggable: false, // the browser's own link drag would take the pointer
        onDragStart: (e: DragEvent) => e.preventDefault(),
        onContextMenu: (e: MouseEvent) => {
          e.preventDefault() // the browser's own menu is not this chip's (a held finger's comes on letting go)
          if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch') return
          onMenu()
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault()
            onStep(e.key === 'ArrowLeft' ? -1 : 1)
            return
          }
          keyDown?.(e)
        },
      })}
    </span>
  )
}
