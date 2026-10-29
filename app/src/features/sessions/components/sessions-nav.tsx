import { Link, useSearch } from '@tanstack/react-router'
import { Archive, ChevronRight, CircleAlert, CircleCheck, EyeOff, Folder, Layers, LoaderCircle, Monitor, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavCount, NavSection, navItemClass, navSubItemClass } from '@/components/ui/nav'
import { cn } from '@/lib/cn'
import { shortFolderNames } from '../model/facets'
import { nestFolders } from '../model/folders'
import { facetsOf, type DeviceFacet } from '../model/counts'
import { toggleable, VIEW_LABEL, VIEWS, type View } from '../model/query'
import { isCurrentScope, parseListSearch, scopeSearch, type ListSearch, type Scope } from '../model/search'
import { useSessionEntries } from '../hooks/use-session-entries'
import { useListPrefs } from '../store'
import { AgentMark } from './agent-mark'
import { sourceIcon } from './source-icon'

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
  return (
    <Link
      to="/"
      search={scopeSearch(search, scope)}
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
}
const FOLDERS_SHOWN = 5

/** A device and, unless folded, its folders: a folder inside another listed one indented under it. */
function DeviceTree({ device, search }: { device: DeviceFacet; search: ListSearch }) {
  const folded = useListPrefs((s) => s.folded.includes(device.label))
  const toggle = useListPrefs((s) => s.toggleFolded)
  const [all, setAll] = useState(false)
  const tree = nestFolders(device.folders)
  const folders = all ? tree : tree.slice(0, FOLDERS_SHOWN)
  const names = shortFolderNames(tree.filter((f) => !f.depth).map((f) => f.item.label))
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <ScopeLink search={search} scope={{ device: device.label }} className={cn(navItemClass, 'pl-8')}>
          <Monitor aria-hidden />
          <span className="truncate">{device.label}</span>
          <NavCount count={device.needs || device.count} alert={device.needs > 0} />
        </ScopeLink>
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
              title={f.label}
              indent={depth}
            >
              <Folder aria-hidden />
              <span className="truncate">{depth ? name : names.get(f.label)}</span>
              <NavCount count={f.needs || f.count} alert={f.needs > 0} />
            </ScopeLink>
          ))}
      {!folded && toggleable(device.folders.length, FOLDERS_SHOWN) ? (
        <button type="button" className={cn(navSubItemClass, 'text-fg-muted')} onClick={() => setAll((v) => !v)}>
          {all ? 'Fewer folders' : `${device.folders.length - FOLDERS_SHOWN} more folders`}
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
  const search = parseListSearch(useSearch({ strict: false }) as Record<string, unknown>)

  return (
    <nav aria-label="Sessions" className="flex flex-col gap-4">
      <NavSection title="Sessions">
        {VIEWS.map((view) => {
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
          <DeviceTree key={d.label} device={d} search={search} />
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
  )
}
