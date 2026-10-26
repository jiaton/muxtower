import { Folder, Monitor } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useFlip } from '@/lib/use-flip'
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
    <div key={entry.key} data-flip={entry.key} className="relative">
      <SessionListRow entry={entry} selected={entry.key === selectedKey} context={context}>
        {extra?.(entry)}
      </SessionListRow>
    </div>
  ))
}

/** A device's folder: a quieter, non-sticky second level under the device's sticky header. */
function SectionHeader({ section, label }: { section: Section; label: string }) {
  return (
    <h4
      data-flip={`section:${section.key}`}
      className="flex items-center gap-1.5 bg-surface-muted px-3 py-1 text-xs text-fg-muted sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
      title={section.label}
    >
      <Folder aria-hidden />
      <span className="min-w-0 truncate font-medium text-fg">{label}</span>
      <span className="ml-auto tabular-nums">{section.entries.length}</span>
    </h4>
  )
}

/** Which rows each group holds, whatever their order within it. */
const membership = (groups: Group[]) => groups.map((g) => `${g.key}:${g.entries.map((e) => e.key).sort()}`).join('|')

/** Sessions in groups with sticky headers; a device group lists its folders as sections. Rows leave out
 *  what their group already says, and slide to their new place when they change groups (a session that
 *  finished, one kept at the end once opened). `extra` renders a slot under a row (quick actions). */
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
  const root = useRef<HTMLDivElement>(null)
  useFlip(root, membership(groups))
  return (
    <div ref={root} className="flex flex-col">
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
            <h3
              data-flip={`group:${group.key}`}
              className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg px-3 py-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase sm:px-4 [&_svg]:size-3.5">
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
