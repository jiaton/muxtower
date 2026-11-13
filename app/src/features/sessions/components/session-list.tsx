import { Monitor, Plus } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Fold } from '@/components/ui/fold'
import { cn } from '@/lib/cn'
import { useFoldAnchor } from '../hooks/use-fold-anchor'
import { useRowMoves } from '../hooks/use-row-moves'
import { buildList, type GroupNode, type Held, type RowNode, type SectionNode } from '../model/list'
import type { Group } from '../model/query'
import { useListPrefs, useNewSessionRequest } from '../store'
import { presetForDevice, presetForFolder } from '../model/new-here'
import type { SessionEntry } from '../model/facets'
import { AgentMark } from './agent-mark'
import { PlaceIcon } from './place-icon'
import type { RowContext } from './session-row'
import { RowView, type Extra } from './session-tree'

import { Button } from '@/components/ui/button'
import { Chevron } from '@/components/ui/indicators'
import { ink, look } from '@/components/ui/intents'

/** What a header says beside its name: how many sessions, and, while folded, how many of them need you
 *  (so folding a group never hides a prompt). */
function HeaderCount({ count, needs, className }: { count: number; needs: number; className?: string }) {
  return (
    <span className={cn(`${ink.count} flex items-center gap-1.5`, className)}>
      {needs ? <Badge tone="permission">{needs} need you</Badge> : null}
      {count}
    </span>
  )
}

/** The button a header is made of: it folds and unfolds what is under it. */
function FoldButton({
  folded,
  onToggle,
  className,
  indent,
  children,
}: {
  folded: boolean
  onToggle?: (header: HTMLButtonElement) => void
  className: string
  /** Extra room on the left, in rem (a nested folder). */
  indent?: number
  children: ReactNode
}) {
  return (
    <Button
      variant="plain"
      aria-expanded={!folded}
      onClick={onToggle ? (e: MouseEvent<HTMLButtonElement>) => onToggle(e.currentTarget) : undefined}
      disabled={!onToggle}
      className={cn('flex w-full items-center text-left', className)}
      style={indent ? { paddingLeft: `calc(0.75rem + ${indent}rem)` } : undefined}
    >
      {onToggle ? <Chevron open={!folded} /> : null}
      {children}
    </Button>
  )
}

const INDENT_REM = 1 // per level of a folder inside another

/** The sessions a header holds: its own rows first, then those of the folders inside it. */
function entriesOf(node: GroupNode | SectionNode): SessionEntry[] {
  const rows = node.children.filter((c): c is RowNode => c.kind === 'row').map((r) => r.entry)
  return [...rows, ...node.children.filter((c): c is SectionNode => c.kind === 'section').flatMap(entriesOf)]
}

/** A header's "+": a new session in that folder, or on that device, with only the rest to choose. */
function StartHere({ node }: { node: GroupNode | SectionNode }) {
  const start = useNewSessionRequest((s) => s.start)
  const where = node.label
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="mr-2 shrink-0 sm:mr-3"
      aria-label={`New session in ${where}`}
      title={`New session in ${where}`}
      onClick={() => {
        const entries = entriesOf(node)
        const preset =
          node.kind === 'section'
            ? presetForFolder(entries, node.placeKind === 'worktree' ? (entries[0]?.session.git?.worktree ?? undefined) : undefined)
            : presetForDevice(entries)
        if (preset) start(preset)
      }}
    >
      <Plus />
    </Button>
  )
}

/** Folds or unfolds what the header (the button clicked) holds, keeping that header where it is on screen. */
type Toggle = (key: string, header: HTMLButtonElement) => void

/** A group's sticky header. Drawn again only when what it says changed (not when another part folds). */
const GroupHeader = memo(
  function GroupHeader({ node, toggle }: { node: GroupNode; toggle: Toggle }) {
    return (
      <h3 className={`${look.listHeader} sticky top-0 z-10 flex items-center`}>
        <FoldButton
          folded={node.folded}
          onToggle={node.foldable ? (header) => toggle(node.key, header) : undefined}
          className={`${ink.eyebrow} ${ink.quietAction} min-w-0 flex-1 gap-2 px-3 py-1.5 sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0`}
        >
          {node.sectioned ? <Monitor aria-hidden /> : node.implies.agent ? <AgentMark decorative agent={node.label} /> : null}
          <span className="truncate">{node.label}</span>
          <HeaderCount count={node.count} needs={node.needs} className="normal-case" />
        </FoldButton>
        {node.implies.device ? <StartHere node={node} /> : null}
      </h3>
    )
  },
  (a, b) =>
    a.toggle === b.toggle &&
    (['key', 'id', 'label', 'sectioned', 'folded', 'foldable', 'count', 'needs'] as const).every((k) => a.node[k] === b.node[k]) &&
    a.node.implies.agent === b.node.implies.agent,
)

/** A device's folder: a quieter, non-sticky second level under the device's sticky header, indented when it
 *  lies inside another listed folder. Folded, it counts what it holds with the folders inside. */
const SectionHeader = memo(
  function SectionHeader({ node, toggle }: { node: SectionNode; toggle: Toggle }) {
    return (
      <h4 title={node.title} className={`${look.selected} flex items-center`}>
        <FoldButton
          folded={node.folded}
          onToggle={node.foldable ? (header) => toggle(node.key, header) : undefined}
          className={`${ink.quietAction} ${ink.meta} min-w-0 flex-1 gap-1.5 px-3 py-1 sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0`}
          indent={node.depth * INDENT_REM}
        >
          <PlaceIcon kind={node.placeKind} />
          <span className={`${ink.strong} min-w-0 truncate`}>{node.label}</span>
          <HeaderCount count={node.count} needs={node.needs} className="ml-auto" />
        </FoldButton>
        <StartHere node={node} />
      </h4>
    )
  },
  (a, b) =>
    a.toggle === b.toggle &&
    (['key', 'label', 'title', 'placeKind', 'depth', 'folded', 'foldable', 'count', 'needs'] as const).every(
      (k) => a.node[k] === b.node[k],
    ),
)

interface Drawn {
  selectedKey?: string
  context: RowContext
  extra?: Extra
  toggle: Toggle
}

/** A folder: its header, then (unless folded) its rows and the folders inside it. */
function SectionView({ node, drawn }: { node: SectionNode; drawn: Drawn }) {
  return (
    <section aria-label={node.label}>
      <SectionHeader node={node} toggle={drawn.toggle} />
      <Fold open={!node.folded}>
        <Children nodes={node.children} drawn={drawn} />
      </Fold>
    </section>
  )
}

function Children({ nodes, drawn }: { nodes: SectionNode['children']; drawn: Drawn }) {
  return nodes.map((child) =>
    child.kind === 'row' ? (
      <RowView key={child.key} node={child} selectedKey={drawn.selectedKey} context={drawn.context} extra={drawn.extra} />
    ) : (
      <SectionView key={child.key} node={child} drawn={drawn} />
    ),
  )
}

/** Every row under a node, folded or not, with the group or folder it is in (`[row key, where]`). */
function placed(node: GroupNode | SectionNode | RowNode, where: string): [string, string][] {
  if (node.kind === 'row') return [[node.key, where], ...node.forks.flatMap((f) => placed(f, where))]
  const here = node.kind === 'section' ? node.key : node.id
  return node.children.flatMap((child) => placed(child, here))
}

/** Sessions in groups with sticky headers; a device group lists its folders as sections (`model/list.ts`).
 *  A header folds what is under it, remembered per `foldScope` (the grouping); while `unfolded` (a
 *  search) everything shows. Rows leave out what their group already says, and slide to their new place
 *  when they change groups (a session that finished, one kept at the end once opened). `extra` renders a
 *  slot under a row (quick actions); `held` is what each row holds: side chats folded under it, forks
 *  listed under it. */
export function SessionList({
  groups,
  selectedKey,
  context = {},
  extra,
  foldScope,
  unfolded = false,
  foldedFirst = false,
  held = {},
}: {
  groups: Group[]
  held?: Held
  selectedKey?: string
  context?: RowContext
  extra?: Extra
  foldScope?: string
  unfolded?: boolean
  /** Every header starts folded (showing its count) until opened: `collapsed` then holds the opened ones. */
  foldedFirst?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const spacer = useRef<HTMLDivElement>(null)
  const collapsed = useListPrefs((s) => s.collapsed)
  const toggleCollapsed = useListPrefs((s) => s.toggleCollapsed)
  const hold = useFoldAnchor(root, spacer)
  const toggle = useCallback<Toggle>(
    (key, header) => {
      // Focus in what is about to fold away goes to its header.
      const region = header.closest('section')
      const focused = document.activeElement
      if (focused && focused !== header && region?.contains(focused)) header.focus()
      // A group's sticky header stuck at the top (the group starts above the view): its group folds at once,
      // the header kept where it is. Played, the header comes unstuck midway and jumps.
      const top = header.closest('h3')
      if (top && region && region.getBoundingClientRect().top < top.getBoundingClientRect().top - 1) instant.current = key
      hold(header)
      toggleCollapsed(key)
    },
    [hold, toggleCollapsed],
  )
  const instant = useRef<string | null>(null)
  useEffect(() => {
    instant.current = null // only for the change it was set for
  })
  const tree = buildList(groups, held, { scope: foldScope, collapsed, foldedFirst, unfolded })
  useRowMoves(root, new Map(tree.flatMap((g) => placed(g, g.id))))

  return (
    <div ref={root} className="flex flex-col">
      {tree.map((group) => {
        const drawn: Drawn = {
          selectedKey,
          extra,
          toggle,
          context: {
            ...context,
            hideDevice: context.hideDevice || group.implies.device,
            hideFolder: context.hideFolder || group.implies.folder,
            hideSource: context.hideSource || group.implies.source,
            showAccount: context.showAccount && !group.implies.account,
            showAgent: context.showAgent && !group.implies.agent,
          },
        }
        return (
          <section key={group.id} aria-label={group.label}>
            <GroupHeader node={group} toggle={toggle} />
            <Fold open={!group.folded} still={instant.current === group.key}>
              <Children nodes={group.children} drawn={drawn} />
            </Fold>
          </section>
        )
      })}
      {/* Room at the end while a fold plays near it (`useFoldAnchor`), cut again once scrolled past. */}
      <div ref={spacer} aria-hidden />
    </div>
  )
}
