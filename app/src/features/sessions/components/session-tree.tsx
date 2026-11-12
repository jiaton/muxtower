import { ChevronRight, GitFork } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { SessionEntry } from '../model/facets'
import type { RowNode } from '../model/list'
import { useListPrefs } from '../store'
import { SessionListRow } from './session-list-row'
import { SideChats } from './side-chats'
import type { RowContext } from './session-row'

/** A slot under a row (quick actions). What it shows must depend on the entry alone: a row is drawn again
 *  only when its entry changed, not when this function did. */
export type Extra = (entry: SessionEntry) => ReactNode

const FORK_INDENT_REM = 1.25 // per level of a fork under its parent
const RAIL_REM = 1.3 // a level's rail, from its rows' left edge: under their state icons' centres
const ICON_MID_REM = 1.25 // a row's state icon's centre, from the row's top
const ICON_BELOW_REM = 1.75 // just under it
const LINE = 'pointer-events-none absolute z-10 border-fg-muted/60' // over the row, whose swipe layer paints a ground

const railX = (level: number) => `calc(${level * FORK_INDENT_REM}rem + ${RAIL_REM}rem)`

/** The tree's lines on a row (file-tree style): at each level above it, the rail of an ancestor that has
 *  more forks below (`rails`); its own join to its parent's rail (├, or └ when it is the last); and, when
 *  its forks show, its own rail from under its state icon down to its first fork's join. */
function TreeLines({ depth, rails, last, open }: { depth: number; rails: boolean[]; last: boolean; open: boolean }) {
  return (
    <>
      {rails.map((on, level) =>
        on ? <span key={level} aria-hidden className={cn(LINE, 'top-0 bottom-0 border-l')} style={{ left: railX(level) }} /> : null,
      )}
      {depth ? (
        <>
          <span
            aria-hidden
            data-join={last ? 'last' : 'more'}
            className={cn(LINE, 'top-0 w-2.5 border-b border-l', last && 'rounded-bl-md')}
            style={{ left: railX(depth - 1), height: `${ICON_MID_REM}rem` }}
          />
          {last ? null : (
            <span aria-hidden className={cn(LINE, 'bottom-0 border-l')} style={{ left: railX(depth - 1), top: `${ICON_MID_REM}rem` }} />
          )}
        </>
      ) : null}
      {open ? (
        <span
          aria-hidden
          data-rail="forks"
          className={cn(LINE, 'bottom-0 border-l')}
          style={{ left: railX(depth), top: `${ICON_BELOW_REM}rem` }}
        />
      ) : null}
    </>
  )
}

/** The line under a row that holds forks: how many, and a chevron to fold them away. A fork that needs
 *  you keeps them open, so folding never hides a prompt. */
function ForkToggle({ count, unread, open, onToggle }: { count: number; unread: number; open: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      disabled={!onToggle}
      className="-mt-1.5 flex items-center gap-1.5 py-1 text-xs text-fg-muted enabled:hover:text-fg"
    >
      <GitFork className="size-3.5" aria-hidden />
      {count} fork{count === 1 ? '' : 's'}
      {!open && unread ? <span className="font-medium text-accent">· {unread} unread</span> : null}
      <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
    </button>
  )
}

interface RowProps {
  node: RowNode
  selectedKey?: string
  context: RowContext
  extra?: Extra
}

/** A row of the list (`RowNode`), with what it holds: side chats folded under it, its forks listed under
 *  it (indented, joined to its rail by ├ and └), each with its own. Drawn again only when what it shows
 *  changed (`sameRowProps`), so folding or updating one part of the list leaves the other rows alone. */
export const RowView = memo(function RowView({ node, selectedKey, context, extra }: RowProps) {
  const toggle = useListPrefs((s) => s.toggleCollapsed)
  const { entry, depth } = node
  const under = extra?.(entry)
  return (
    <>
      <div
        data-flip={entry.key}
        data-row={entry.key}
        className="relative"
        style={depth ? { paddingLeft: `${depth * FORK_INDENT_REM}rem` } : undefined}
      >
        <SessionListRow entry={entry} selected={entry.key === selectedKey} context={depth ? { ...context, nested: true } : context}>
          {under || node.sideChats || node.forkCount ? (
            <>
              {under}
              {node.sideChats ? <SideChats entries={node.sideChats} selectedKey={selectedKey} /> : null}
              {node.forkCount ? (
                <ForkToggle
                  count={node.forkCount}
                  unread={node.forkUnread}
                  open={node.forksOpen}
                  onToggle={node.forksAsking ? undefined : () => toggle(node.forksKey)}
                />
              ) : null}
            </>
          ) : null}
        </SessionListRow>
        <TreeLines depth={depth} rails={node.rails} last={node.last} open={node.forksOpen} />
      </div>
      {node.forksOpen
        ? node.forks.map((fork) => <RowView key={fork.key} node={fork} selectedKey={selectedKey} context={context} extra={extra} />)
        : null}
    </>
  )
}, sameRowProps)

const sameList = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined, same: (x: T, y: T) => boolean) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => same(x, b[i]!)))
const sameEntry = (a: SessionEntry, b: SessionEntry) => a.key === b.key && a.session === b.session && a.daemon === b.daemon

/** Whether two rows show the same: the same session (its object changes only when it does), the same place
 *  in a fork tree, the same forks and side chats. */
export function sameRow(a: RowNode, b: RowNode): boolean {
  return (
    sameEntry(a.entry, b.entry) &&
    a.depth === b.depth &&
    a.last === b.last &&
    sameList(a.rails, b.rails, (x, y) => x === y) &&
    a.forksOpen === b.forksOpen &&
    a.forksAsking === b.forksAsking &&
    a.forkCount === b.forkCount &&
    a.forkUnread === b.forkUnread &&
    sameList(a.sideChats, b.sideChats, sameEntry) &&
    sameList(a.forks, b.forks, sameRow)
  )
}

/** Whether the selected session is this row, one of its side chats or forks. */
const holds = (node: RowNode, key: string | undefined): boolean =>
  key !== undefined && (node.key === key || !!node.sideChats?.some((e) => e.key === key) || node.forks.some((f) => holds(f, key)))

const sameContext = (a: RowContext, b: RowContext) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof RowContext>
  return [...keys].every((k) => a[k] === b[k])
}

function sameRowProps(a: RowProps, b: RowProps): boolean {
  const selection = a.selectedKey === b.selectedKey || (!holds(a.node, a.selectedKey) && !holds(b.node, b.selectedKey))
  return selection && sameRow(a.node, b.node) && sameContext(a.context, b.context)
}
