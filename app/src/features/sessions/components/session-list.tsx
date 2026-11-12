import { ChevronRight, Monitor } from 'lucide-react'
import { memo, useRef, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { useFlip } from '@/lib/use-flip'
import { buildList, shownRows, type GroupNode, type Held, type SectionNode } from '../model/list'
import type { Group } from '../model/query'
import { useListPrefs } from '../store'
import { AgentMark } from './agent-mark'
import { PlaceIcon } from './place-icon'
import type { RowContext } from './session-row'
import { RowView, type Extra } from './session-tree'

/** What a header says beside its name: how many sessions, and, while folded, how many of them need you
 *  (so folding a group never hides a prompt). */
function HeaderCount({ count, needs, className }: { count: number; needs: number; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 tabular-nums', className)}>
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
  onToggle?: () => void
  className: string
  /** Extra room on the left, in rem (a nested folder). */
  indent?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-expanded={!folded}
      onClick={onToggle}
      disabled={!onToggle}
      className={cn('flex w-full items-center text-left', className)}
      style={indent ? { paddingLeft: `calc(0.75rem + ${indent}rem)` } : undefined}
    >
      {onToggle ? <ChevronRight aria-hidden className={cn('transition-transform', !folded && 'rotate-90')} /> : null}
      {children}
    </button>
  )
}

const INDENT_REM = 1 // per level of a folder inside another

type Toggle = (key: string) => void

/** A group's sticky header. Drawn again only when what it says changed (not when another part folds). */
const GroupHeader = memo(
  function GroupHeader({ node, toggle }: { node: GroupNode; toggle: Toggle }) {
    return (
      <h3 data-flip={`group:${node.id}`} className="sticky top-0 z-10">
        <FoldButton
          folded={node.folded}
          onToggle={node.foldable ? () => toggle(node.key) : undefined}
          className="gap-2 border-b border-border bg-bg px-3 py-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase hover:text-fg sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          {node.sectioned ? <Monitor aria-hidden /> : node.implies.agent ? <AgentMark decorative agent={node.label} /> : null}
          <span className="truncate">{node.label}</span>
          <HeaderCount count={node.count} needs={node.needs} className="normal-case" />
        </FoldButton>
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
      <h4 data-flip={`section:${node.key}`} title={node.title}>
        <FoldButton
          folded={node.folded}
          onToggle={node.foldable ? () => toggle(node.key) : undefined}
          className="gap-1.5 bg-surface-muted px-3 py-1 text-xs text-fg-muted hover:text-fg sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
          indent={node.depth * INDENT_REM}
        >
          <PlaceIcon kind={node.placeKind} />
          <span className="min-w-0 truncate font-medium text-fg">{node.label}</span>
          <HeaderCount count={node.count} needs={node.needs} className="ml-auto" />
        </FoldButton>
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
      {node.folded ? null : <Children nodes={node.children} drawn={drawn} />}
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

/** The rows shown, by group, and which groups and sections are folded: what a move or a fold changes. */
const shape = (tree: GroupNode[]) =>
  tree
    .map(
      (g) =>
        `${g.id}${g.folded ? '-' : ':'}${shownRows([g])
          .map((r) => r.key)
          .sort()}`,
    )
    .join('|')

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
  const collapsed = useListPrefs((s) => s.collapsed)
  const toggle = useListPrefs((s) => s.toggleCollapsed)
  const tree = buildList(groups, held, { scope: foldScope, collapsed, foldedFirst, unfolded })
  useFlip(root, shape(tree))

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
            {group.folded ? null : <Children nodes={group.children} drawn={drawn} />}
          </section>
        )
      })}
    </div>
  )
}
