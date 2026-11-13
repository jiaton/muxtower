import { GitFork } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { Fold } from '@/components/ui/fold'

import type { SessionEntry } from '../model/facets'
import type { RowNode } from '../model/list'
import { useListPrefs } from '../store'
import { SessionListRow } from './session-list-row'
import { SideChats } from './side-chats'
import type { RowContext } from './session-row'
import { TREE_INDENT_REM, TreeLines } from '@/components/ui/tree-lines'
import { RowToggle } from '@/components/ui/row-toggle'

/** A slot under a row (quick actions). What it shows must depend on the entry alone: a row is drawn again
 *  only when its entry changed, not when this function did. */
export type Extra = (entry: SessionEntry) => ReactNode

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
      <div data-row={entry.key} className="relative" style={depth ? { paddingLeft: `${depth * TREE_INDENT_REM}rem` } : undefined}>
        <SessionListRow entry={entry} selected={entry.key === selectedKey} context={depth ? { ...context, nested: true } : context}>
          {under || node.sideChats || node.forkCount ? (
            <>
              {under}
              {node.sideChats ? <SideChats entries={node.sideChats} selectedKey={selectedKey} /> : null}
              {node.forkCount ? (
                <RowToggle
                  icon={<GitFork />}
                  label={`${node.forkCount} fork${node.forkCount === 1 ? '' : 's'}`}
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
      {node.forkCount ? (
        <Fold open={node.forksOpen}>
          {node.forks.map((fork) => (
            <RowView key={fork.key} node={fork} selectedKey={selectedKey} context={context} extra={extra} />
          ))}
        </Fold>
      ) : null}
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
