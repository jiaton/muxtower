import type { ReactNode } from 'react'
import type { SessionEntry } from '../model/facets'
import type { Group } from '../model/query'
import { SessionRow, type RowContext } from './session-row'

/** Sessions in groups with sticky headers. `extra` renders a slot under a row (quick actions). */
export function SessionList({
  groups,
  selectedKey,
  context,
  extra,
}: {
  groups: Group[]
  selectedKey?: string
  context?: RowContext
  extra?: (entry: SessionEntry) => ReactNode
}) {
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg px-3 py-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase sm:px-4">
            <span className="truncate">{group.label}</span>
            <span className="tabular-nums">{group.entries.length}</span>
          </h3>
          {group.entries.map((entry) => (
            <SessionRow key={entry.key} entry={entry} selected={entry.key === selectedKey} context={context}>
              {extra?.(entry)}
            </SessionRow>
          ))}
        </section>
      ))}
    </div>
  )
}
