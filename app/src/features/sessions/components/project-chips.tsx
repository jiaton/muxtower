import { Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

/** Teams a group's menu lists before "More teams…". */
const TEAMS_SHOWN = 6

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

  if (!chips) return null
  const count = (chip: ProjectChip) => filterEntries(entries, { view: query.view, group: query.group, chip }).length
  const saveAll = (next: ChipGroup[], done?: () => void) => save.mutate(next, { onSuccess: done })
  const move = (group: ChipGroup, by: -1 | 1) => {
    const at = groups.findIndex((g) => g.id === group.id)
    const next = [...groups]
    ;[next[at], next[at + by]] = [next[at + by], next[at]]
    saveAll(next)
  }

  return (
    <nav aria-label="Projects" data-own-swipe className={cn(bleedRow.outer, className)}>
      <div ref={row} className={cn(bleedRow.inner, 'flex gap-1.5 overflow-x-auto [scrollbar-width:none]')}>
        {chips.map((chip) => {
          const group = groups.find((g) => g.id === chip.id)
          const current = search.chip === chip.id
          return (
            <TeamCard
              key={chip.id}
              project={group || chip.projects[0] === OTHER ? null : teamProject(entries, chip.projects[0])}
              entries={entries}
            >
              <HeldChip
                search={search}
                chip={chip}
                current={current}
                count={count(chip)}
                onHold={group ? (x, y) => setMenu({ group, x, y }) : undefined}
              />
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
