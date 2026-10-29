import { Link } from '@tanstack/react-router'
import { Monitor } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Facets } from '../model/counts'
import { AgentMark } from './agent-mark'
import { ASIDE_VIEWS, VIEWS, type SessionQuery, type View } from '../model/query'
import { scopeSearch, type ListSearch, type Scope } from '../model/search'

const VIEW_CHIP: Partial<Record<View, string>> = { all: 'All', needs: 'Needs you', unread: 'Unread', working: 'Working' }

/** One row of what to show, one at a time (where the sidebar is not shown): everything, what needs you,
 *  what finished unread, what works, then each device, then each agent when there is more than one, with
 *  counts. It scrolls sideways when it does not fit, with the current one in view. A folder, a source or
 *  an account is chosen from the filter menu. */
export function ListChips({
  query,
  search,
  facets,
  className,
}: {
  query: SessionQuery
  search: ListSearch
  facets: Facets
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const scoped = Boolean(query.device || query.folder || query.agent || query.source || query.account)
  const deviceOnly = Boolean(query.device && !query.agent && !query.source && !query.account)
  const agentOnly = Boolean(query.agent && !query.device && !query.source && !query.account)
  const views = VIEWS.filter((view) => !ASIDE_VIEWS.includes(view))
  const devices = facets.devices.length > 1 ? facets.devices : []
  const current = `${query.view}\u0000${query.device ?? ''}\u0000${query.folder ?? ''}\u0000${query.agent ?? ''}`

  useLayoutEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!el || !chip) return
    if (chip.offsetLeft < el.scrollLeft || chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2
  }, [current])

  return (
    <nav aria-label="Show" className={cn('-mx-3 sm:-mx-4', className)}>
      <div ref={row} className="flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4">
        {views.map((view) => (
          <Chip
            key={view}
            search={search}
            scope={{ view }}
            current={!scoped && query.view === view}
            count={facets.views[view]}
            tone={view === 'needs' ? 'needs' : view === 'unread' ? 'unread' : undefined}
          >
            {VIEW_CHIP[view]}
          </Chip>
        ))}
        {devices.length ? <span aria-hidden className="my-1.5 w-px shrink-0 bg-border" /> : null}
        {devices.map((d) => (
          <Chip key={d.label} search={search} scope={{ device: d.label }} current={deviceOnly && query.device === d.label} count={d.count}>
            <Monitor className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-32 truncate">{d.label}</span>
          </Chip>
        ))}
        {facets.agents.length ? <span aria-hidden className="my-1.5 w-px shrink-0 bg-border" /> : null}
        {facets.agents.map((a) => (
          <Chip key={a.label} search={search} scope={{ agent: a.label }} current={agentOnly && query.agent === a.label} count={a.count}>
            <AgentMark decorative agent={a.label} />
            <span className="max-w-32 truncate">{a.label}</span>
          </Chip>
        ))}
      </div>
    </nav>
  )
}

function Chip({
  search,
  scope,
  current,
  count,
  tone,
  children,
}: {
  search: ListSearch
  scope: Scope
  current: boolean
  count: number
  tone?: 'needs' | 'unread'
  children: ReactNode
}) {
  return (
    <Link
      to="/"
      search={scopeSearch(search, scope)}
      aria-current={current}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors',
        current ? 'border-fg bg-fg text-bg' : 'border-border bg-surface text-fg hover:bg-surface-muted',
      )}
    >
      {children}
      <span
        className={cn(
          'tabular-nums',
          current
            ? 'opacity-70'
            : !count
              ? 'text-fg-muted'
              : tone === 'needs'
                ? 'text-state-permission'
                : tone === 'unread'
                  ? 'text-accent'
                  : 'text-fg-muted',
        )}
      >
        {count}
      </span>
    </Link>
  )
}
