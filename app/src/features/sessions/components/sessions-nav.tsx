import { Link, useMatch, useNavigate, useSearch } from '@tanstack/react-router'
import { Archive, ChevronRight, CircleAlert, CircleCheck, EyeOff, Layers, LoaderCircle, Monitor, RotateCcw, UserRound } from 'lucide-react'
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from 'react'
import { NavCount, NavSection, navItemClass, navSubItemClass } from '@/components/ui/nav'
import { cn } from '@/lib/cn'
import { shortFolderNames } from '../model/facets'
import type { MachineUsage } from '@/lib/api/types'
import { WarningMark } from '@/components/ui/warning-mark'
import { alertText } from '@/lib/daemons/usage'
import { useMachineUsage } from '@/lib/daemons/use-usage'
import { nestFolders } from '../model/folders'
import { PlaceIcon } from './place-icon'
import { facetsOf, type DeviceFacet } from '../model/counts'
import { soleSession, toggleable, VIEW_LABEL, VIEWS, type View } from '../model/query'
import { isCurrentScope, parseListSearch, scopeSearch, toQuery, type ListSearch, type Scope } from '../model/search'
import { SPLIT_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { entryKey, type SessionEntry } from '../model/facets'
import { useSessionEntries } from '../hooks/use-session-entries'
import { useListPrefs } from '../store'
import { AgentMark } from './agent-mark'
import { sourceIcon } from './source-icon'

/** Opens the scope's only session with it, when that is what a click on it would show (see `useSoleOpener`). */
const SoleOpener = createContext<(event: MouseEvent, target: ListSearch) => void>(() => {})

/** Side by side with the list (where opening it loses no one), a click on a scope that holds one session
 *  opens it too; not on a phone, not when it is the session already open, and only on a click, never
 *  because the list changed. */
function useSoleOpener(entries: SessionEntry[]) {
  const navigate = useNavigate()
  const split = useMediaQuery(SPLIT_QUERY)
  const group = useListPrefs((s) => s.group)
  const open = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false })
  const openKey = open ? entryKey(open.params.daemonId, open.params.sessionId) : undefined
  return (event: MouseEvent, target: ListSearch) => {
    if (!split || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    const sole = soleSession(entries, toQuery(target, group), openKey)
    if (!sole) return
    event.preventDefault()
    void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: sole.daemon.id, sessionId: sole.session.id }, search: target })
  }
}

/** A sidebar entry for a scope of the list. It is current by the list's search params, also while one
 *  of its sessions is open (the router alone would only see that on the list's own path). */
function ScopeLink({
  search,
  scope,
  className,
  children,
  title,
  indent,
}: {
  search: ListSearch
  scope: Scope
  className: string
  children: ReactNode
  title?: string
  /** Levels below its parent entry (a folder inside another). */
  indent?: number
}) {
  const openSole = useContext(SoleOpener)
  const target = scopeSearch(search, scope)
  return (
    <Link
      to="/"
      search={target}
      onClick={(event) => openSole(event, target)}
      activeOptions={{ exact: true }}
      data-current={isCurrentScope(search, scope)}
      className={className}
      title={title}
      style={indent ? { paddingLeft: `calc(2.25rem + ${indent}rem)` } : undefined}
    >
      {children}
    </Link>
  )
}

const VIEW_ICONS: Record<View, typeof Layers> = {
  all: Layers,
  needs: CircleAlert,
  unread: CircleCheck,
  working: LoaderCircle,
  hidden: EyeOff,
  archived: Archive,
  interrupted: RotateCcw,
}
const FOLDERS_SHOWN = 8

/** A device and, unless folded, its folders: a folder inside another listed one indented under it. */
function DeviceTree({ device, search, usage }: { device: DeviceFacet; search: ListSearch; usage?: MachineUsage }) {
  const alerts = usage && !usage.stale ? (usage.alerts ?? []) : []
  const folded = useListPrefs((s) => s.folded.includes(device.label))
  const toggle = useListPrefs((s) => s.toggleFolded)
  const [all, setAll] = useState(false)
  const tree = nestFolders(device.folders)
  const more = toggleable(tree.length, FOLDERS_SHOWN)
  const folders = all || !more ? tree : tree.slice(0, FOLDERS_SHOWN)
  const names = shortFolderNames(tree.filter((f) => !f.depth).map((f) => f.item.label))
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <ScopeLink search={search} scope={{ device: device.label }} className={cn(navItemClass, 'pl-8', alerts.length && 'pr-9')}>
          <Monitor aria-hidden />
          <span className="truncate">{device.label}</span>
          <NavCount count={device.needs || device.count} alert={device.needs > 0} />
        </ScopeLink>
        <WarningMark
          what={device.label}
          lines={alerts.map(alertText)}
          details={alerts.flatMap((a) => (a.detail ? [a.detail] : []))}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        />
        {device.folders.length ? (
          <button
            type="button"
            aria-label={folded ? `Show folders of ${device.label}` : `Hide folders of ${device.label}`}
            aria-expanded={!folded}
            onClick={() => toggle(device.label)}
            className="absolute top-1/2 left-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', !folded && 'rotate-90')} aria-hidden />
          </button>
        ) : null}
      </div>
      {folded
        ? null
        : folders.map(({ item: f, depth, name }) => (
            <ScopeLink
              key={f.label}
              search={search}
              scope={{ device: device.label, folder: f.label }}
              className={navSubItemClass}
              title={f.title ?? f.label}
              indent={depth}
            >
              <PlaceIcon kind={f.kind} />
              <span className="truncate">{depth ? name : names.get(f.label)}</span>
              <NavCount count={f.needs || f.count} alert={f.needs > 0} />
            </ScopeLink>
          ))}
      {!folded && more ? (
        <button type="button" className={cn(navSubItemClass, 'text-fg-muted')} onClick={() => setAll((v) => !v)}>
          {all ? 'Fewer folders' : `${tree.length - FOLDERS_SHOWN} more folders`}
        </button>
      ) : null}
    </div>
  )
}

/** The sidebar: views, each device with its folders, agents when there is more than one, sources, and
 *  accounts when there is more than one, each with its count. The router
 *  marks the entry whose search params the list shows (data-status=active), also while one of its
 *  sessions is open. */
export function SessionsNav() {
  const { entries } = useSessionEntries()
  const facets = facetsOf(entries)
  const usage = useMachineUsage()
  const search = parseListSearch(useSearch({ strict: false }) as Record<string, unknown>)
  const openSole = useSoleOpener(entries)

  return (
    <SoleOpener.Provider value={openSole}>
      <nav aria-label="Sessions" className="flex flex-col gap-4">
        <NavSection title="Sessions">
          {VIEWS.filter((view) => view !== 'interrupted' || facets.views.interrupted).map((view) => {
            const Icon = VIEW_ICONS[view]
            return (
              <ScopeLink key={view} search={search} scope={{ view }} className={navItemClass}>
                <Icon aria-hidden />
                <span className="truncate">{VIEW_LABEL[view]}</span>
                <NavCount count={facets.views[view]} alert={view === 'needs'} accent={view === 'unread'} />
              </ScopeLink>
            )
          })}
        </NavSection>
        <NavSection title="Devices">
          {facets.devices.map((d) => (
            <DeviceTree key={d.label} device={d} search={search} usage={usage.get(d.label.toLowerCase())} />
          ))}
        </NavSection>
        {facets.agents.length ? (
          <NavSection title="Agents">
            {facets.agents.map((a) => (
              <ScopeLink key={a.label} search={search} scope={{ agent: a.label }} className={navItemClass}>
                <AgentMark decorative agent={a.label} className="size-4" />
                <span className="truncate">{a.label}</span>
                <NavCount count={a.needs || a.count} alert={a.needs > 0} />
              </ScopeLink>
            ))}
          </NavSection>
        ) : null}
        <NavSection title="Sources">
          {facets.sources.map((s) => {
            const Icon = sourceIcon(s.label)
            return (
              <ScopeLink key={s.label} search={search} scope={{ source: s.label }} className={navItemClass}>
                <Icon aria-hidden />
                <span className="truncate">{s.label}</span>
                <NavCount count={s.needs || s.count} alert={s.needs > 0} />
              </ScopeLink>
            )
          })}
        </NavSection>
        {facets.accounts.length ? (
          <NavSection title="Accounts">
            {facets.accounts.map((a) => (
              <ScopeLink key={a.label} search={search} scope={{ account: a.label }} className={navItemClass}>
                <UserRound aria-hidden />
                <span className="truncate">{a.label}</span>
                <NavCount count={a.needs || a.count} alert={a.needs > 0} />
              </ScopeLink>
            ))}
          </NavSection>
        ) : null}
      </nav>
    </SoleOpener.Provider>
  )
}
