import { Link, useNavigate } from '@tanstack/react-router'
import { CheckCheck, Rows3, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { GROUPINGS, GROUP_LABEL, type GroupBy, type SessionQuery } from '../model/query'
import { useMarkRead } from '../api/use-session-marks'
import { folderName, type SessionEntry } from '../model/facets'
import { scopeOf, scopeSearch, type ListSearch } from '../model/search'
import { useListPrefs } from '../store'
import { box, text } from '@/components/ui/styles'

const SEARCH_DEBOUNCE_MS = 200

/** Filters by name, folder, device or what the session said; kept in the URL (debounced). */
export function SearchField({ search }: { search: ListSearch }) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState(search.q ?? '')
  useEffect(() => setTyped(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === typed) return
    const timer = setTimeout(
      () => void navigate({ to: '.', search: (prev: ListSearch) => ({ ...prev, q: typed || undefined }), replace: true }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [typed, search.q, navigate])
  return (
    <Input
      icon={<Search />}
      type="search"
      value={typed}
      onChange={(e) => setTyped(e.target.value)}
      placeholder="Search sessions"
      aria-label="Search sessions"
      className="h-9"
    />
  )
}

/** The list's view menu: how rows are grouped (remembered as the default), and marking what it shows
 *  read. */
export function ListMenu({
  query,
  unread,
  agents,
  accounts,
}: {
  query: SessionQuery
  unread: SessionEntry[]
  /** There is more than one agent, or account, to group by. */
  agents: boolean
  accounts: boolean
}) {
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
          {GROUPINGS.filter((group) => (group !== 'account' || accounts) && (group !== 'agent' || agents)).map((group) => (
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

/** What the list is narrowed to (device › folder, an agent, a source, or an account), with a way out;
 *  not a device alone, which the title and the device's own chip say. */
export function ScopeChip({ query, search }: { query: SessionQuery; search: ListSearch }) {
  const scope = scopeOf(query)
  if (!scope || (scope.device && !scope.folder && !scope.agent && !scope.source && !scope.account)) return null
  const label = [scope.device, scope.folder ? folderName(scope.folder) : null, scope.agent, scope.source, scope.account]
    .filter(Boolean)
    .join(' › ')
  return (
    <Link
      to="/"
      search={scopeSearch(search, { view: 'all' })}
      className={`${box({ radius: 'full', ground: 'muted' })} ${text({ size: 'xs', tone: 'fg' })} inline-flex max-w-full items-center gap-1 self-start py-1 pr-2 pl-3`}
      aria-label={`Show everything, not only ${label}`}
      title={scope.folder}
    >
      <span className="truncate">{label}</span>
      <X className={`${text({ tone: 'muted' })} size-3.5 shrink-0`} aria-hidden />
    </Link>
  )
}
