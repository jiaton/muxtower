import { ChevronRight, Folder, Monitor } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { useFlip } from '@/lib/use-flip'
import { shortFolderNames, type SessionEntry } from '../model/facets'
import type { Group, Section } from '../model/query'
import { foldKey, useListPrefs } from '../store'
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

/** What a header says beside its name: how many sessions, and, while folded, how many of them need you
 *  (so folding a group never hides a prompt). */
function HeaderCount({ entries, folded, className }: { entries: SessionEntry[]; folded: boolean; className?: string }) {
  const needs = folded ? entries.filter((e) => e.session.needs_attention).length : 0
  return (
    <span className={cn('flex items-center gap-1.5 tabular-nums', className)}>
      {needs ? <Badge tone="permission">{needs} need you</Badge> : null}
      {entries.length}
    </span>
  )
}

/** The button a header is made of: it folds and unfolds what is under it. */
function FoldButton({ folded, onToggle, className, children }: { folded: boolean; onToggle?: () => void; className: string; children: ReactNode }) {
  return (
    <button type="button" aria-expanded={!folded} onClick={onToggle} disabled={!onToggle} className={cn('flex w-full items-center text-left', className)}>
      {onToggle ? <ChevronRight aria-hidden className={cn('transition-transform', !folded && 'rotate-90')} /> : null}
      {children}
    </button>
  )
}

/** A device's folder: a quieter, non-sticky second level under the device's sticky header. */
function SectionHeader({ section, label, folded, onToggle }: { section: Section; label: string; folded: boolean; onToggle?: () => void }) {
  return (
    <h4 data-flip={`section:${section.key}`} title={section.label}>
      <FoldButton
        folded={folded}
        onToggle={onToggle}
        className="gap-1.5 bg-surface-muted px-3 py-1 text-xs text-fg-muted hover:text-fg sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
      >
        <Folder aria-hidden />
        <span className="min-w-0 truncate font-medium text-fg">{label}</span>
        <HeaderCount entries={section.entries} folded={folded} className="ml-auto" />
      </FoldButton>
    </h4>
  )
}

/** Which rows each group holds, whatever their order within it, and which are folded away. */
const membership = (groups: Group[], folded: string[]) =>
  `${groups.map((g) => `${g.key}:${g.entries.map((e) => e.key).sort()}`).join('|')}#${folded.join('|')}`

/** Sessions in groups with sticky headers; a device group lists its folders as sections. A header folds
 *  what is under it, remembered per `foldScope` (the grouping); while `unfolded` (a search) everything
 *  shows. Rows leave out what their group already says, and slide to their new place when they change
 *  groups (a session that finished, one kept at the end once opened). `extra` renders a slot under a row
 *  (quick actions). */
export function SessionList({
  groups,
  selectedKey,
  context = {},
  extra,
  foldScope,
  unfolded = false,
}: {
  groups: Group[]
  selectedKey?: string
  context?: RowContext
  extra?: Extra
  foldScope?: string
  unfolded?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const collapsed = useListPrefs((s) => s.collapsed)
  const toggle = useListPrefs((s) => s.toggleCollapsed)
  const foldable = foldScope !== undefined && !unfolded
  const keyOf = (...parts: string[]) => foldKey(foldScope ?? '', ...parts)
  const isFolded = (key: string) => foldable && collapsed.includes(key)
  const onToggle = (key: string) => (foldable ? () => toggle(key) : undefined)
  const folded = foldable ? collapsed : []
  useFlip(root, membership(groups, folded))

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
        const groupKey = keyOf(group.key)
        const groupFolded = isFolded(groupKey)
        return (
          <section key={group.key} aria-label={group.label}>
            <h3 data-flip={`group:${group.key}`} className="sticky top-0 z-10">
              <FoldButton
                folded={groupFolded}
                onToggle={onToggle(groupKey)}
                className="gap-2 border-b border-border bg-bg px-3 py-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase hover:text-fg sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
              >
                {group.sections ? <Monitor aria-hidden /> : null}
                <span className="truncate">{group.label}</span>
                <HeaderCount entries={group.entries} folded={groupFolded} className="normal-case" />
              </FoldButton>
            </h3>
            {groupFolded ? null : group.sections && names ? (
              group.sections.map((section) => {
                const sectionKey = keyOf(group.key, section.key)
                const sectionFolded = isFolded(sectionKey)
                return (
                  <section key={section.key} aria-label={section.label}>
                    <SectionHeader
                      section={section}
                      label={names.get(section.label) ?? section.label}
                      folded={sectionFolded}
                      onToggle={onToggle(sectionKey)}
                    />
                    {sectionFolded ? null : <Rows entries={section.entries} selectedKey={selectedKey} context={rowContext} extra={extra} />}
                  </section>
                )
              })
            ) : (
              <Rows entries={group.entries} selectedKey={selectedKey} context={rowContext} extra={extra} />
            )}
          </section>
        )
      })}
    </div>
  )
}
