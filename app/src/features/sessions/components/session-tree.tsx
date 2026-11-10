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
  rails,
  last,
  selectedKey,
  context,
  extra,
  held,
}: {
  entry: SessionEntry
  depth: number
  rails: boolean[]
  last: boolean
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
        <TreeLines depth={depth} rails={rails} last={last} open={!!forks && open} />
      </div>
      {forks && open ? (
        <Rows
          entries={forks}
          depth={depth + 1}
          rails={depth ? [...rails, !last] : rails}
          selectedKey={selectedKey}
          context={context}
          extra={extra}
          held={held}
        />
      ) : null}
    </>
  )
}

/** Rows of the list, each with what it holds: side chats folded under it, forks listed under it (indented,
 *  joined to its rail by ├ and └), each fork with its own. `rails`: the levels above whose rails go on
 *  past these rows. */
export function Rows({
  entries,
  depth = 0,
  rails = [],
  selectedKey,
  context,
  extra,
  held,
}: {
  entries: SessionEntry[]
  depth?: number
  rails?: boolean[]
  selectedKey?: string
  context: RowContext
  extra?: Extra
  held: Held
}) {
  return entries.map((entry, i) => (
    <Row
      key={entry.key}
      entry={entry}
      depth={depth}
      rails={rails}
      last={i === entries.length - 1}
      selectedKey={selectedKey}
      context={context}
      extra={extra}
      held={held}
    />
  ))
}

/** Entries with the forks they hold, for counting what a folded header hides. */
export const withForks = (entries: SessionEntry[], forks?: Map<string, SessionEntry[]>) =>
  forks ? entries.flatMap((e) => [e, ...forksUnder(e.key, forks)]) : entries
