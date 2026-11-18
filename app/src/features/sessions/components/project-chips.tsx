import { Plus } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
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
import { chip } from '@/components/ui/chip'
import { dragging } from '@/components/ui/intents'
import { holdScroll } from '@/components/ui/gesture'
import { movedTo, slotAt, stepped } from '../model/chip-order'

/** Teams a group's menu lists before "More teams…". */
const TEAMS_SHOWN = 6

const LIFT_MS = 300 // a finger held this long picks a chip up
const DRAG_PX = 6 // a mouse moved this far is dragging, not clicking
const SCROLL_PX = 8 // a finger moved this far before the lift is scrolling the row
const EDGE_PX = 32 // a drag this near the row's edge scrolls it
const EDGE_STEP = 8

/**
 * The second chip row: the owner's groups of projects in their order (or, while there are none, the most
 * recently active projects), each with how many sessions of the chosen view it holds, then "+" for a new
 * group. A chip chosen again is let go. Groups are put in order by dragging them along the row (a mouse
 * past a few pixels: a click still chooses; a finger after a long press, so a swipe still scrolls the row),
 * or with Alt+←/→ on a focused chip. A right click, or a long press let go without moving, offers its teams,
 * Edit and Delete, under the chip it belongs to. Projects shown while there are no groups are in order of
 * activity, and do not move; "+" stays last. Not shown for a single project and no groups.
 */
export function ProjectChips({
  query,
  search,
  entries,
  groups,
  className,
}: {
  query: SessionQuery
  search: ListSearch
  entries: SessionEntry[]
  groups: ChipGroup[]
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const save = useSaveChipGroups()
  const [editing, setEditing] = useState<ChipGroup | 'new' | null>(null)
  const [menu, setMenu] = useState<{ group: ChipGroup; label: string; x: number; y: number } | null>(null)
  const [allTeams, setAllTeams] = useState(false)
  const [team, setTeam] = useState<{ project: string; x: number; y: number; open: boolean } | null>(null)
  const teams = menu ? teamsOfGroup(menu.group, entries) : []
  const chips = projectChips(groups, entries)

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
  const drag = useChipDrag(row, ids, reorder, (id, rect) => {
    const group = groups.find((g) => g.id === id)
    if (group) setMenu({ group, label: group.name, x: rect.left, y: rect.bottom })
  })

  if (!chips) return null
  const count = (chip: ProjectChip) => filterEntries(entries, { view: query.view, group: query.group, chip }).length
  // While a chip is dragged, the row shows where it would land (the chip itself, marked, in that place).
  const shown = drag.order ? drag.order.map((id) => chips.find((c) => c.id === id)!).filter(Boolean) : chips

  return (
    <nav aria-label="Projects" data-own-swipe className={cn(bleedRow.outer, className)}>
      <div ref={row} className={cn(bleedRow.inner, 'flex gap-1.5 overflow-x-auto [scrollbar-width:none]')}>
        {shown.map((chip) => {
          const group = groups.find((g) => g.id === chip.id)
          const current = search.chip === chip.id
          return (
            <TeamCard
              key={chip.id}
              project={group || chip.projects[0] === OTHER ? null : teamProject(entries, chip.projects[0])}
              entries={entries}
            >
              <span data-chip-id={chip.id} className={cn('inline-flex', drag.dragging === chip.id && dragging)}>
                <Chip
                  search={search}
                  scope={{ chip: current ? '' : chip.id }}
                  current={current}
                  count={count(chip)}
                  className="[-webkit-touch-callout:none]"
                  {...(group ? drag.handlers(chip.id) : {})}
                >
                  <span className="max-w-40 truncate">{chip.label}</span>
                </Chip>
              </span>
            </TeamCard>
          )
        })}
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
      </div>
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

/**
 * Dragging chips into order along the row: by mouse once it has moved a few pixels (so a click still
 * chooses), by finger once held (a vibration says so; before that a swipe scrolls the row, and after it the
 * row is held still). The chip moves into the place it would land, marked; near the row's edges the row
 * scrolls. Let go: `onDrop` with the new order. A right click, or a held finger let go without moving:
 * `onMenu` with the chip's box. Alt+←/→ on a focused chip moves it one place.
 */
function useChipDrag(
  row: RefObject<HTMLDivElement | null>,
  ids: string[],
  onDrop: (order: string[]) => void,
  onMenu: (id: string, rect: DOMRect) => void,
) {
  const [state, setState] = useState<{ id: string; to: number; moving: boolean } | null>(null)
  const g = useRef<{
    id: string
    pointerId: number
    touch: boolean
    x0: number
    y0: number
    lifted: boolean
    active: boolean
    timer?: number
    centres: number[]
    to: number
    target: HTMLElement
  } | null>(null)
  const swallowClick = useRef(false)
  const scroller = useRef<number | undefined>(undefined)
  // The latest, for the window's listeners a press adds (a drag outlives the render it began in).
  const latest = useRef({ ids, onDrop, onMenu })
  latest.current = { ids, onDrop, onMenu }
  const unlisten = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = row.current
    if (!el) return
    return holdScroll(el, () => Boolean(g.current?.lifted || g.current?.active))
  }, [row])

  const contentX = (clientX: number) => {
    const el = row.current!
    return clientX - el.getBoundingClientRect().left + el.scrollLeft
  }
  const measure = (id: string) => {
    const el = row.current!
    return [...el.querySelectorAll<HTMLElement>('[data-chip-id]')]
      .filter((c) => c.dataset.chipId !== id && latest.current.ids.includes(c.dataset.chipId ?? ''))
      .map((c) => {
        const r = c.getBoundingClientRect()
        return r.left - el.getBoundingClientRect().left + el.scrollLeft + r.width / 2
      })
  }
  const begin = () => {
    const d = g.current!
    d.active = true
    d.centres = measure(d.id)
    setState({ id: d.id, to: d.to, moving: true })
  }
  const edgeScroll = (clientX: number) => {
    const el = row.current!
    const box = el.getBoundingClientRect()
    const by = clientX < box.left + EDGE_PX ? -EDGE_STEP : clientX > box.right - EDGE_PX ? EDGE_STEP : 0
    window.clearInterval(scroller.current)
    if (by) scroller.current = window.setInterval(() => (el.scrollLeft += by), 16)
  }
  const end = () => {
    const d = g.current
    if (d) window.clearTimeout(d.timer)
    window.clearInterval(scroller.current)
    unlisten.current?.()
    unlisten.current = null
    g.current = null
    setState(null)
  }

  // Followed on the window, not the chip: the chip moves in the row as it is dragged (its node moved, its
  // pointer capture lost), and the pointer may leave it.
  const moveTo = (e: globalThis.PointerEvent) => {
    const d = g.current
    if (!d || d.pointerId !== e.pointerId) return
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (!d.active) {
      if (d.touch && !d.lifted) {
        if (moved > SCROLL_PX) end() // a swipe: the row scrolls
        return
      }
      if (moved < DRAG_PX) return
      begin()
    }
    d.to = slotAt(d.centres, contentX(e.clientX))
    setState({ id: d.id, to: d.to, moving: true })
    edgeScroll(e.clientX)
  }
  const letGo = (e: globalThis.PointerEvent) => {
    const d = g.current
    if (!d || d.pointerId !== e.pointerId) return
    if (d.active) {
      swallowClick.current = true // a drop is no click
      latest.current.onDrop(movedTo(latest.current.ids, d.id, d.to))
    } else if (d.lifted) {
      swallowClick.current = true
      latest.current.onMenu(d.id, d.target.getBoundingClientRect()) // held, not moved: its menu
    }
    end()
  }
  useEffect(() => () => unlisten.current?.(), [])

  const handlers = (id: string) => ({
    'data-reorder': '',
    // A link dragged with a mouse is the browser's own drag (of its address), which cancels the pointer's.
    draggable: false,
    onDragStart: (e: DragEvent) => e.preventDefault(),
    onPointerDown: (e: PointerEvent<HTMLAnchorElement>) => {
      if (e.button !== 0) return
      const touch = e.pointerType !== 'mouse'
      const from = ids.indexOf(id)
      g.current = {
        id, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY, lifted: false, active: false, centres: [],
        to: from, target: e.currentTarget,
      } // prettier-ignore
      unlisten.current?.()
      const cancel = () => end()
      window.addEventListener('pointermove', moveTo)
      window.addEventListener('pointerup', letGo)
      window.addEventListener('pointercancel', cancel)
      unlisten.current = () => {
        window.removeEventListener('pointermove', moveTo)
        window.removeEventListener('pointerup', letGo)
        window.removeEventListener('pointercancel', cancel)
      }
      if (touch) {
        g.current.timer = window.setTimeout(() => {
          const d = g.current
          if (!d || d.id !== id) return
          d.lifted = true
          navigator.vibrate?.(10)
          setState({ id, to: from, moving: false })
        }, LIFT_MS)
      }
    },
    onClick: (e: MouseEvent) => {
      if (swallowClick.current) e.preventDefault()
      swallowClick.current = false
    },
    onContextMenu: (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault() // the browser's own menu is not this chip's
      end()
      onMenu(id, e.currentTarget.getBoundingClientRect())
    },
    onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      e.preventDefault()
      const next = stepped(ids, id, e.key === 'ArrowLeft' ? -1 : 1)
      if (next) onDrop(next)
    },
  })

  return {
    handlers,
    dragging: state?.id ?? null,
    order: state?.moving ? movedTo(ids, state.id, state.to) : null,
  }
}
