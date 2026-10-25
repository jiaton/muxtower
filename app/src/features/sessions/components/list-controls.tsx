import { Link, useNavigate } from '@tanstack/react-router'
import { ListFilter, Rows3, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { GROUPINGS, GROUP_LABEL, VIEWS, VIEW_LABEL, type Facets, type GroupBy, type SessionQuery } from '../model/query'
import { scopeSearch, type ListSearch } from '../model/search'
import { useListPrefs } from '../store'

const SEARCH_DEBOUNCE_MS = 200

/** Filters by name, folder, device or what the session said; kept in the URL (debounced). */
export function SearchField({ search }: { search: ListSearch }) {
  const navigate = useNavigate()
  const [text, setText] = useState(search.q ?? '')
  useEffect(() => setText(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === text) return
    const timer = setTimeout(
      () => void navigate({ to: '.', search: (prev: ListSearch) => ({ ...prev, q: text || undefined }), replace: true }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [text, search.q, navigate])
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search sessions"
        aria-label="Search sessions"
        className="h-9 pl-8"
      />
    </div>
  )
}

/** All / Needs you / Working, with counts (where the sidebar is not shown). */
export function ViewTabs({
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
  const navigate = useNavigate()
  return (
    <Segmented
      className={className}
      aria-label="Show"
      value={query.device || query.folder ? ('none' as never) : query.view}
      onChange={(view) => void navigate({ to: '/', search: scopeSearch(search, { view }) })}
      options={VIEWS.map((view) => ({
        value: view,
        label: (
          <>
            {view === 'all' ? 'All' : VIEW_LABEL[view]}
            <span className={cn('tabular-nums', view === 'needs' && facets.views.needs ? 'text-state-permission' : 'text-fg-muted')}>
              {facets.views[view]}
            </span>
          </>
        ),
      }))}
    />
  )
}

/** How rows are grouped; the choice is remembered as the default. */
export function GroupMenu({ query }: { query: SessionQuery }) {
  const navigate = useNavigate()
  const setGroup = useListPrefs((s) => s.setGroup)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Group by ${GROUP_LABEL[query.group].toLowerCase()}`} title="Group by">
          <Rows3 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={query.group}
          onValueChange={(value) => {
            const group = value as GroupBy
            setGroup(group)
            void navigate({ to: '.', search: (prev: ListSearch) => ({ ...prev, group }) })
          }}
        >
          {GROUPINGS.map((group) => (
            <DropdownMenuRadioItem key={group} value={group}>
              {GROUP_LABEL[group]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One device or one folder (where the sidebar is not shown). */
export function FilterMenu({
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
  const navigate = useNavigate()
  const scope = query.device ? `d:${query.device}` : query.folder ? `f:${query.folder}` : ''
  const active = Boolean(scope)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Filter by device or folder"
          title="Filter"
          className={cn(active && 'text-accent', className)}
        >
          <ListFilter />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={scope}
          onValueChange={(value) =>
            void navigate({
              to: '/',
              search: scopeSearch(
                search,
                value.startsWith('d:') ? { device: value.slice(2) } : value.startsWith('f:') ? { folder: value.slice(2) } : { view: 'all' },
              ),
            })
          }
        >
          <DropdownMenuRadioItem value="">Everything</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Devices</DropdownMenuLabel>
          {facets.devices.map((d) => (
            <DropdownMenuRadioItem key={d.label} value={`d:${d.label}`}>
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="text-xs text-fg-muted tabular-nums">{d.count}</span>
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Folders</DropdownMenuLabel>
          {facets.folders.map((f) => (
            <DropdownMenuRadioItem key={f.label} value={`f:${f.label}`}>
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              <span className="text-xs text-fg-muted tabular-nums">{f.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The device or folder the list is narrowed to, with a way out. */
export function ScopeChip({ query, search }: { query: SessionQuery; search: ListSearch }) {
  const label = query.device ?? query.folder
  if (!label) return null
  return (
    <Link
      to="/"
      search={scopeSearch(search, { view: 'all' })}
      className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-surface-muted py-1 pr-2 pl-3 text-xs text-fg"
      aria-label={`Show everything, not only ${label}`}
    >
      <span className="truncate">{label}</span>
      <X className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
    </Link>
  )
}
