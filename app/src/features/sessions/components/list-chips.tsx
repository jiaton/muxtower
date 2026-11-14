import { Link } from '@tanstack/react-router'
import { Monitor } from 'lucide-react'
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Facets } from '../model/counts'
import { AgentMark } from './agent-mark'
import { ASIDE_VIEWS, VIEWS, type SessionQuery, type View } from '../model/query'
import { scopeSearch, type ListSearch, type Scope } from '../model/search'
import { Divider } from '@/components/ui/divider'
import { chip, chipCount } from '@/components/ui/chip'
import { bleedRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useCountsKnown } from '../hooks/use-counts-known'

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
    const chip = el?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"]')
    if (!el || !chip) return
    if (chip.offsetLeft < el.scrollLeft || chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2
  }, [current])

  return (
    <nav aria-label="Show" data-own-swipe className={cn(bleedRow.outer, className)}>
      <div ref={row} className={cn(bleedRow.inner, 'flex gap-1.5 overflow-x-auto [scrollbar-width:none]')}>
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
        {devices.length ? <Divider vertical /> : null}
        {devices.map((d) => (
          <Chip key={d.label} search={search} scope={{ device: d.label }} current={deviceOnly && query.device === d.label} count={d.count}>
            <Monitor className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-32 truncate">{d.label}</span>
          </Chip>
        ))}
        {facets.agents.length ? <Divider vertical /> : null}
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

export function Chip({
  search,
  scope,
  current,
  count,
  tone,
  children,
  ...rest
}: {
  search: ListSearch
  scope: Scope
  current: boolean
  count: number
  tone?: 'needs' | 'unread'
  children: ReactNode
} & Omit<ComponentProps<'a'>, 'children' | 'href'>) {
  const known = useCountsKnown()
  return (
    <Link
      {...rest}
      to="/"
      search={scopeSearch(search, scope)}
      aria-current={current}
      data-current={current}
      className={cn(rest.className, chip({ kind: 'filter' }))}
    >
      {children}
      {known ? (
        <span className={chipCount({ tone: !count ? 'muted' : tone === 'needs' ? 'warning' : tone === 'unread' ? 'accent' : 'muted' })}>
          {count}
        </span>
      ) : (
        <Skeleton shape="count" /> // not "0": the sessions have not come yet
      )}
    </Link>
  )
}
