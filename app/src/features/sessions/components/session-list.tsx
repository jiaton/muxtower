import { Folder, Monitor } from 'lucide-react'
import type { ReactNode } from 'react'
import { shortFolderNames, type SessionEntry } from '../model/facets'
import type { Group, Section } from '../model/query'
import { SessionListRow } from './session-list-row'
import type { RowContext } from './session-row'

type Extra = (entry: SessionEntry) => ReactNode

function Rows({
  entries,
  selectedKey,
  context,
  extra,
}: {
  entries: SessionEntry[]
  selectedKey?: string
  context: RowContext
  extra?: Extra
}) {
  return entries.map((entry) => (
    <SessionListRow key={entry.key} entry={entry} selected={entry.key === selectedKey} context={context}>
      {extra?.(entry)}
    </SessionListRow>
  ))
}

/** A device's folder: a quieter, non-sticky second level under the device's sticky header. */
function SectionHeader({ section, label }: { section: Section; label: string }) {
  return (
    <h4
      className="flex items-center gap-1.5 bg-surface-muted px-3 py-1 text-xs text-fg-muted sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
      title={section.label}
    >
      <Folder aria-hidden />
      <span className="min-w-0 truncate font-medium text-fg">{label}</span>
      <span className="ml-auto tabular-nums">{section.entries.length}</span>
    </h4>
  )
}

/** Sessions in groups with sticky headers; a device group lists its folders as sections. Rows leave out
 *  what their group already says. `extra` renders a slot under a row (quick actions). */
export function SessionList({
  groups,
  selectedKey,
  context = {},
  extra,
}: {
  groups: Group[]
  selectedKey?: string
  context?: RowContext
  extra?: Extra
}) {
  return (
    <div className="flex flex-col">
      {groups.map((group) => {
        const rowContext: RowContext = {
          ...context,
          hideDevice: context.hideDevice || group.implies.device,
          hideFolder: context.hideFolder || group.implies.folder,
          hideSource: context.hideSource || group.implies.source,
        }
        const names = group.sections ? shortFolderNames(group.sections.map((s) => s.label)) : null
        return (
          <section key={group.key} aria-label={group.label}>
            <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg px-3 py-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase sm:px-4 [&_svg]:size-3.5">
              {group.sections ? <Monitor aria-hidden /> : null}
              <span className="truncate">{group.label}</span>
              <span className="tabular-nums">{group.entries.length}</span>
            </h3>
            {group.sections && names ? (
              group.sections.map((section) => (
                <section key={section.key} aria-label={section.label}>
                  <SectionHeader section={section} label={names.get(section.label) ?? section.label} />
                  <Rows entries={section.entries} selectedKey={selectedKey} context={rowContext} extra={extra} />
                </section>
              ))
            ) : (
              <Rows entries={group.entries} selectedKey={selectedKey} context={rowContext} extra={extra} />
            )}
          </section>
        )
      })}
    </div>
  )
}
