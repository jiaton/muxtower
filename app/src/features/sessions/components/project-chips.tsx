import { Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import { newChipId, useSaveChipGroups } from '../api/use-chip-groups'
import { MAX_GROUPS, projectChips, projectsByActivity, type ChipGroup, type ProjectChip } from '../model/chip-groups'
import type { SessionEntry } from '../model/facets'
import { filterEntries, type SessionQuery } from '../model/query'
import type { ListSearch } from '../model/search'
import { ChipGroupDialog } from './chip-group-dialog'
import { Chip } from './list-chips'

const HOLD_MS = 500

/**
 * The second chip row: the owner's groups of projects in their order (or, while there are none, the most
 * recently active projects), each with how many sessions of the chosen view it holds, then "+" for a new
 * group. A chip chosen again is let go. A long press (a right click) on a group offers Edit, Move and
 * Delete: no dragging, which would fight the row's sideways scroll. Not shown for a single project and no
 * groups.
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
  const [menu, setMenu] = useState<{ group: ChipGroup; x: number; y: number } | null>(null)
  const chips = projectChips(groups, entries)

  useLayoutEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"]')
    if (!el || !chip) return
    if (chip.offsetLeft < el.scrollLeft || chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2
  }, [search.chip, chips?.length])

  if (!chips) return null
  const count = (chip: ProjectChip) => filterEntries(entries, { view: query.view, group: query.group, projects: chip.projects }).length
  const saveAll = (next: ChipGroup[], done?: () => void) => save.mutate(next, { onSuccess: done })
  const move = (group: ChipGroup, by: -1 | 1) => {
    const at = groups.findIndex((g) => g.id === group.id)
    const next = [...groups]
    ;[next[at], next[at + by]] = [next[at + by], next[at]]
    saveAll(next)
  }

  return (
    <nav aria-label="Projects" className={cn('-mx-3 sm:-mx-4', className)}>
      <div ref={row} className="flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4">
        {chips.map((chip) => {
          const group = groups.find((g) => g.id === chip.id)
          const current = search.chip === chip.id
          return (
            <HeldChip
              key={chip.id}
              search={search}
              chip={chip}
              current={current}
              count={count(chip)}
              onHold={group ? (x, y) => setMenu({ group, x, y }) : undefined}
            />
          )
        })}
        {groups.length < MAX_GROUPS ? (
          <button
            type="button"
            aria-label="New group"
            title="New group"
            onClick={() => setEditing('new')}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-dashed border-border px-2.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <DropdownMenu open={Boolean(menu)} onOpenChange={(open) => open || setMenu(null)}>
        <DropdownMenuTrigger asChild>
          <span aria-hidden tabIndex={-1} className="pointer-events-none fixed size-0" style={{ left: menu?.x, top: menu?.y }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={12} onCloseAutoFocus={(e) => e.preventDefault()}>
          {menu ? (
            <>
              <DropdownMenuItem onSelect={() => setEditing(menu.group)}>Edit</DropdownMenuItem>
              {groups[0]?.id !== menu.group.id ? (
                <DropdownMenuItem onSelect={() => move(menu.group, -1)}>Move left</DropdownMenuItem>
              ) : null}
              {groups.at(-1)?.id !== menu.group.id ? (
                <DropdownMenuItem onSelect={() => move(menu.group, 1)}>Move right</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem tone="danger" onSelect={() => saveAll(groups.filter((g) => g.id !== menu.group.id))}>
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {editing ? (
        <ChipGroupDialog
          group={editing === 'new' ? undefined : editing}
          projects={projectsByActivity(entries)}
          error={save.error}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(name, projects) => {
            const next =
              editing === 'new'
                ? [...groups, { id: newChipId(), name, projects }]
                : groups.map((g) => (g.id === editing.id ? { ...g, name, projects } : g))
            saveAll(next, () => setEditing(null))
          }}
        />
      ) : null}
    </nav>
  )
}

/** A chip a long press (or right click) holds: `onHold` with where, and the click it would make is none. */
function HeldChip({
  search,
  chip,
  current,
  count,
  onHold,
}: {
  search: ListSearch
  chip: ProjectChip
  current: boolean
  count: number
  onHold?: (x: number, y: number) => void
}) {
  const timer = useRef<number | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)
  const stop = () => {
    window.clearTimeout(timer.current)
    start.current = null
  }
  const hold = onHold
    ? {
        onContextMenu: (e: MouseEvent) => {
          e.preventDefault() // the browser's own menu is not this chip's
          stop()
          held.current = false
          onHold(e.clientX, e.clientY)
        },
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType === 'mouse') return
          held.current = false
          start.current = { x: e.clientX, y: e.clientY }
          const { clientX, clientY } = e
          timer.current = window.setTimeout(() => {
            held.current = true
            onHold(clientX, clientY)
          }, HOLD_MS)
        },
        onPointerMove: (e: PointerEvent) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) stop() // scrolling
        },
        onPointerUp: stop,
        onPointerCancel: stop,
        onClick: (e: MouseEvent) => {
          if (held.current) e.preventDefault() // the press opened the menu: no choosing too
          held.current = false
        },
      }
    : {}
  return (
    <Chip
      search={search}
      scope={{ chip: current ? '' : chip.id }}
      current={current}
      count={count}
      className="[-webkit-touch-callout:none]"
      {...hold}
    >
      <span className="max-w-40 truncate">{chip.label}</span>
    </Chip>
  )
}
