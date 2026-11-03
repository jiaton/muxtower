import { ChevronRight, Folder, Monitor } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { useFlip } from '@/lib/use-flip'
import { shortFolderNames, type SessionEntry } from '../model/facets'
import type { Group, Section } from '../model/query'
import { foldKey, useListPrefs } from '../store'
import { AgentMark } from './agent-mark'
import type { RowContext } from './session-row'
import { Rows, withForks, type Extra, type Held } from './session-tree'

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

/** A device's folder: a quieter, non-sticky second level under the device's sticky header, indented
 *  when it lies inside another listed folder. Folded, it counts what it holds with the folders inside. */
function SectionHeader({
  section,
  label,
  held,
  folded,
  onToggle,
}: {
  section: Section
  label: string
  held: SessionEntry[]
  folded: boolean
  onToggle?: () => void
}) {
  return (
    <h4 data-flip={`section:${section.key}`} title={section.label}>
      <FoldButton
        folded={folded}
        onToggle={onToggle}
        className="gap-1.5 bg-surface-muted px-3 py-1 text-xs text-fg-muted hover:text-fg sm:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
        indent={(section.depth ?? 0) * INDENT_REM}
      >
        <Folder aria-hidden />
        <span className="min-w-0 truncate font-medium text-fg">{label}</span>
        <HeaderCount entries={folded ? held : section.entries} folded={folded} className="ml-auto" />
      </FoldButton>
    </h4>
  )
}

/** A section's entries with those of the folders inside it (they follow it, deeper, in tree order). */
function heldBy(sections: Section[], index: number): SessionEntry[] {
  const depth = sections[index].depth ?? 0
  const end = sections.findIndex((s, i) => i > index && (s.depth ?? 0) <= depth)
  return sections.slice(index, end === -1 ? undefined : end).flatMap((s) => s.entries)
}

/** Which rows each group holds, whatever their order within it, and which are folded away. */
const membership = (groups: Group[], folded: string[]) =>
  `${groups.map((g) => `${g.key}:${g.entries.map((e) => e.key).sort()}`).join('|')}#${folded.join('|')}`

/** Sessions in groups with sticky headers; a device group lists its folders as sections. A header folds
 *  what is under it, remembered per `foldScope` (the grouping); while `unfolded` (a search) everything
 *  shows. Rows leave out what their group already says, and slide to their new place when they change
 *  groups (a session that finished, one kept at the end once opened). `extra` renders a slot under a row
 *  (quick actions); `held` is what each row holds: side chats folded under it, forks listed under it. */
export function SessionList({
  groups,
  selectedKey,
  context = {},
  extra,
  foldScope,
  unfolded = false,
  held = {},
}: {
  groups: Group[]
  held?: Held
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
          showAccount: context.showAccount && !group.implies.account,
          showAgent: context.showAgent && !group.implies.agent,
        }
        const names = group.sections ? shortFolderNames(group.sections.filter((s) => !s.depth).map((s) => s.label)) : null
        const closed = new Set<string>() // folded sections, and every one inside them
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
                {group.sections ? <Monitor aria-hidden /> : group.implies.agent ? <AgentMark decorative agent={group.label} /> : null}
                <span className="truncate">{group.label}</span>
                <HeaderCount entries={withForks(group.entries, held.forks)} folded={groupFolded} className="normal-case" />
              </FoldButton>
            </h3>
            {groupFolded ? null : group.sections && names ? (
              group.sections.map((section, index, sections) => {
                if (section.parent && closed.has(section.parent)) {
                  closed.add(section.key)
                  return null
                }
                const sectionKey = keyOf(group.key, section.key)
                const sectionFolded = isFolded(sectionKey)
                if (sectionFolded) closed.add(section.key)
                return (
                  <section key={section.key} aria-label={section.label}>
                    <SectionHeader
                      section={section}
                      label={section.depth ? (section.name ?? section.label) : (names.get(section.label) ?? section.label)}
                      held={withForks(heldBy(sections, index), held.forks)}
                      folded={sectionFolded}
                      onToggle={onToggle(sectionKey)}
                    />
                    {sectionFolded ? null : (
                      <Rows entries={section.entries} selectedKey={selectedKey} context={rowContext} extra={extra} held={held} />
                    )}
                  </section>
                )
              })
            ) : (
              <Rows entries={group.entries} selectedKey={selectedKey} context={rowContext} extra={extra} held={held} />
            )}
          </section>
        )
      })}
    </div>
  )
}
