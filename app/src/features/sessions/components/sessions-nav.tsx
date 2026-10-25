import { Link, useSearch } from '@tanstack/react-router'
import { CircleAlert, Folder, Layers, LoaderCircle, Monitor } from 'lucide-react'
import { useState } from 'react'
import { NavCount, NavSection, navItemClass } from '@/components/ui/nav'
import { facetsOf, toggleable, VIEW_LABEL, type View } from '../model/query'
import { parseListSearch, scopeSearch } from '../model/search'
import { useSessionEntries } from '../hooks/use-session-entries'

const VIEW_ICONS: Record<View, typeof Layers> = { all: Layers, needs: CircleAlert, working: LoaderCircle }
const FOLDERS_SHOWN = 6

/** The sidebar: views, devices and folders, each with its count. The router marks the entry whose
 *  search params the list shows (data-status=active), also while one of its sessions is open. */
export function SessionsNav() {
  const { entries } = useSessionEntries()
  const facets = facetsOf(entries)
  const search = parseListSearch(useSearch({ strict: false }) as Record<string, unknown>)
  const [allFolders, setAllFolders] = useState(false)
  const folders = allFolders ? facets.folders : facets.folders.slice(0, FOLDERS_SHOWN)

  return (
    <nav aria-label="Sessions" className="flex flex-col gap-4">
      <NavSection title="Sessions">
        {(['all', 'needs', 'working'] as const).map((view) => {
          const Icon = VIEW_ICONS[view]
          return (
            <Link key={view} to="/" search={scopeSearch(search, { view })} className={navItemClass}>
              <Icon aria-hidden />
              <span className="truncate">{VIEW_LABEL[view]}</span>
              <NavCount count={facets.views[view]} alert={view === 'needs'} />
            </Link>
          )
        })}
      </NavSection>
      <NavSection title="Devices">
        {facets.devices.map((d) => (
          <Link key={d.label} to="/" search={scopeSearch(search, { device: d.label })} className={navItemClass}>
            <Monitor aria-hidden />
            <span className="truncate">{d.label}</span>
            <NavCount count={d.needs || d.count} alert={d.needs > 0} />
          </Link>
        ))}
      </NavSection>
      <NavSection
        title="Folders"
        action={
          toggleable(facets.folders.length, FOLDERS_SHOWN) ? (
            <button type="button" className="normal-case tracking-normal hover:text-fg" onClick={() => setAllFolders((v) => !v)}>
              {allFolders ? 'Fewer' : `All ${facets.folders.length}`}
            </button>
          ) : undefined
        }
      >
        {folders.map((f) => (
          <Link key={f.label} to="/" search={scopeSearch(search, { folder: f.label })} className={navItemClass} title={f.label}>
            <Folder aria-hidden />
            <span className="truncate">{f.label}</span>
            <NavCount count={f.needs || f.count} alert={f.needs > 0} />
          </Link>
        ))}
      </NavSection>
    </nav>
  )
}
