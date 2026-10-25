import { Link, useNavigate } from '@tanstack/react-router'
import { CheckCheck, EyeOff, Folder, ListFilter, Monitor, Rows3, Search, X } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useMarkRead } from '../api/use-session-marks'
import { folderName, shortFolderNames, type SessionEntry } from '../model/facets'
import { scopeOf, scopeSearch, type ListSearch, type Scope } from '../model/search'
import { useListPrefs } from '../store'
import { sourceIcon } from './source-icon'

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
      value={scopeOf(query) || query.view === 'hidden' ? ('none' as never) : query.view}
      onChange={(view) => void navigate({ to: '/', search: scopeSearch(search, { view }) })}
      options={VIEWS.filter((view) => view !== 'hidden').map((view) => ({
        value: view,
        label: (
          <>
            {view === 'all' ? 'All' : VIEW_LABEL[view]}
            <span
              className={cn(
                'tabular-nums',
                !facets.views[view]
                  ? 'text-fg-muted'
                  : view === 'needs'
                    ? 'text-state-permission'
                    : view === 'unread'
                      ? 'text-accent'
                      : 'text-fg-muted',
              )}
            >
              {facets.views[view]}
            </span>
          </>
        ),
      }))}
    />
  )
}

/** The list's view menu: how rows are grouped (remembered as the default), and marking what it shows
 *  read. */
export function ListMenu({ query, unread }: { query: SessionQuery; unread: SessionEntry[] }) {
  const navigate = useNavigate()
  const setGroup = useListPrefs((s) => s.setGroup)
  const markRead = useMarkRead()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="List options" title="Group by, mark read">
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!unread.length}
          onSelect={() => unread.forEach((e) => markRead.mutate({ daemonId: e.daemon.id, sessionId: e.session.id, read: true }))}
        >
          <CheckCheck /> Mark {unread.length ? `${unread.length} ` : ''}as read
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SEP = '\u0000'
const encodeScope = (scope: Scope | null) => (scope ? [scope.device ?? '', scope.folder ?? '', scope.source ?? ''].join(SEP) : '')
function decodeScope(value: string): Scope {
  if (!value) return { view: 'all' }
  const [device, folder, source] = value.split(SEP)
  return { device: device || undefined, folder: folder || undefined, source: source || undefined }
}

/** One device (or one of its folders) or one source (where the sidebar is not shown). */
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
  const scope = scopeOf(query)
  const count = (n: number) => <span className="text-xs text-fg-muted tabular-nums">{n}</span>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Filter by device, folder or source"
          title="Filter"
          className={cn(scope && 'text-accent', className)}
        >
          <ListFilter />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[70dvh] overflow-y-auto">
        <DropdownMenuRadioGroup
          value={encodeScope(scope)}
          onValueChange={(value) => void navigate({ to: '/', search: scopeSearch(search, decodeScope(value)) })}
        >
          <DropdownMenuRadioItem value="">Everything</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Devices and folders</DropdownMenuLabel>
          {facets.devices.map((d) => {
            const names = shortFolderNames(d.folders.map((f) => f.label))
            return (
              <Fragment key={d.label}>
                <DropdownMenuRadioItem value={encodeScope({ device: d.label })}>
                  <Monitor className="text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  {count(d.count)}
                </DropdownMenuRadioItem>
                {d.folders.map((f) => (
                  <DropdownMenuRadioItem
                    key={f.label}
                    value={encodeScope({ device: d.label, folder: f.label })}
                    className="pl-8"
                    title={f.label}
                  >
                    <Folder className="text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{names.get(f.label)}</span>
                    {count(f.count)}
                  </DropdownMenuRadioItem>
                ))}
              </Fragment>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Sources</DropdownMenuLabel>
          {facets.sources.map((src) => {
            const Icon = sourceIcon(src.label)
            return (
              <DropdownMenuRadioItem key={src.label} value={encodeScope({ source: src.label })}>
                <Icon className="text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{src.label}</span>
                {count(src.count)}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!facets.views.hidden}
          onSelect={() => void navigate({ to: '/', search: scopeSearch(search, { view: 'hidden' }) })}
        >
          <EyeOff className="text-fg-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Hidden sessions</span>
          {count(facets.views.hidden)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** What the list is narrowed to (device › folder, or a source), with a way out. */
export function ScopeChip({ query, search }: { query: SessionQuery; search: ListSearch }) {
  const scope = scopeOf(query)
  if (!scope) return null
  const label = [scope.device, scope.folder ? folderName(scope.folder) : null, scope.source].filter(Boolean).join(' › ')
  return (
    <Link
      to="/"
      search={scopeSearch(search, { view: 'all' })}
      className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-surface-muted py-1 pr-2 pl-3 text-xs text-fg"
      aria-label={`Show everything, not only ${label}`}
      title={scope.folder}
    >
      <span className="truncate">{label}</span>
      <X className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
    </Link>
  )
}
