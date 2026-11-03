import { ChevronRight, GitFork } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { SessionEntry } from '../model/facets'
import { forksUnder } from '../model/forks'
import { foldKey, useListPrefs } from '../store'
import { SessionListRow } from './session-list-row'
import { SideChats } from './side-chats'
import type { RowContext } from './session-row'

export type Extra = (entry: SessionEntry) => ReactNode

export interface Held {
  /** The side chats each row holds (`foldSideChats`), folded under it. */
  sideChats?: Map<string, SessionEntry[]>
  /** The forks each row holds (`foldForks`), listed under it as a tree. */
  forks?: Map<string, SessionEntry[]>
}

const FORK_INDENT_REM = 1.25 // per level of a fork under its parent

/** The line under a row that holds forks: how many, and a chevron to fold them away. A fork that needs
 *  you keeps them open, so folding never hides a prompt. */
function ForkToggle({ forks, open, onToggle }: { forks: SessionEntry[]; open: boolean; onToggle?: () => void }) {
  const unread = forks.filter((e) => e.session.unread).length
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      disabled={!onToggle}
      className="-mt-1.5 flex items-center gap-1.5 py-1 text-xs text-fg-muted enabled:hover:text-fg"
    >
      <GitFork className="size-3.5" aria-hidden />
      {forks.length} fork{forks.length === 1 ? '' : 's'}
      {!open && unread ? <span className="font-medium text-accent">· {unread} unread</span> : null}
      <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
    </button>
  )
}

function Row({
  entry,
  depth,
  selectedKey,
  context,
  extra,
  held,
}: {
  entry: SessionEntry
  depth: number
  selectedKey?: string
  context: RowContext
  extra?: Extra
  held: Held
}) {
  const key = foldKey('forks', entry.key)
  const collapsed = useListPrefs((s) => s.collapsed.includes(key))
  const toggle = useListPrefs((s) => s.toggleCollapsed)
  const sideChats = held.sideChats?.get(entry.key)
  const forks = held.forks?.get(entry.key)
  const asking = forks ? forksUnder(entry.key, held.forks!).some((e) => e.session.needs_attention) : false
  const open = !collapsed || asking
  const under = extra?.(entry)
  return (
    <>
      <div data-flip={entry.key} className="relative" style={depth ? { paddingLeft: `${depth * FORK_INDENT_REM}rem` } : undefined}>
        <SessionListRow entry={entry} selected={entry.key === selectedKey} context={depth ? { ...context, nested: true } : context}>
          {under || sideChats || forks ? (
            <>
              {under}
              {sideChats ? <SideChats entries={sideChats} selectedKey={selectedKey} /> : null}
              {forks ? <ForkToggle forks={forks} open={open} onToggle={asking ? undefined : () => toggle(key)} /> : null}
            </>
          ) : null}
        </SessionListRow>
        {depth ? (
          // └ from the parent's state icon to this one's (over the row, whose swipe layer paints a ground)
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 h-5 w-2.5 rounded-bl-md border-b border-l border-fg-muted/60"
            style={{ left: `calc(${(depth - 1) * FORK_INDENT_REM}rem + 1.3rem)` }}
          />
        ) : null}
      </div>
      {forks && open ? (
        <Rows entries={forks} depth={depth + 1} selectedKey={selectedKey} context={context} extra={extra} held={held} />
      ) : null}
    </>
  )
}

/** Rows of the list, each with what it holds: side chats folded under it, forks listed under it (indented,
 *  joined by └), each fork with its own. */
export function Rows({
  entries,
  depth = 0,
  selectedKey,
  context,
  extra,
  held,
}: {
  entries: SessionEntry[]
  depth?: number
  selectedKey?: string
  context: RowContext
  extra?: Extra
  held: Held
}) {
  return entries.map((entry) => (
    <Row key={entry.key} entry={entry} depth={depth} selectedKey={selectedKey} context={context} extra={extra} held={held} />
  ))
}

/** Entries with the forks they hold, for counting what a folded header hides. */
export const withForks = (entries: SessionEntry[], forks?: Map<string, SessionEntry[]>) =>
  forks ? entries.flatMap((e) => [e, ...forksUnder(e.key, forks)]) : entries
