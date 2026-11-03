/** Counts for the navigation (per view, device and folder, agent, source, account) and the folders a new
 *  session is offered, over the same labels as the list's query. */
import {
  NO_ENVIRONMENT,
  UNKNOWN_ACCOUNT,
  UNKNOWN_FOLDER,
  accountsDiffer,
  agentsDiffer,
  compareAgents,
  folderOf,
  isAssistant,
  placeOf,
  statusOf,
  type SessionEntry,
} from './facets'
import { withRepositories } from './folders'
import { homeKind, worktreeOf, type PlaceKind } from './places'
import { SOURCE_ORDER, accountLabel, agentLabel, deviceLabel, folderLabel, orderBy, sourceLabel, type View } from './query'

export interface Facet {
  label: string
  count: number
  /** How many of them need you. */
  needs: number
  /** A worktree: the repository it is listed under, its name there (its branch), and its folder. */
  under?: string
  name?: string
  title?: string
  kind?: PlaceKind
}

export interface DeviceFacet extends Facet {
  folders: Facet[]
}

export interface Facets {
  views: Record<View, number>
  /** Each device with its folders: where things run, then what they work on. */
  devices: DeviceFacet[]
  /** Empty when every session is the same agent. */
  agents: Facet[]
  sources: Facet[]
  /** Empty when every session runs as the same account (or none says). */
  accounts: Facet[]
}

function facet(entries: SessionEntry[], labelOf: (e: SessionEntry) => string, last: string): Facet[] {
  const counts = new Map<string, Facet>()
  for (const entry of entries) {
    const label = labelOf(entry)
    const current = counts.get(label) ?? { label, count: 0, needs: 0 }
    current.count += 1
    if (entry.session.needs_attention) current.needs += 1
    counts.set(label, current)
  }
  return [...counts.values()].sort(
    (a, b) => Number(a.label === last) - Number(b.label === last) || b.count - a.count || a.label.localeCompare(b.label),
  )
}

/** Counts for the navigation: per view, per device and its folders, per agent, per source. The assistant is not
 *  counted, nor are hidden or archived sessions anywhere but in their own view. */
export function facetsOf(entries: SessionEntry[]): Facets {
  const counted = entries.filter((e) => !isAssistant(e.session) && placeOf(e.session) === 'listed')
  return {
    views: {
      all: counted.length,
      needs: counted.filter((e) => statusOf(e.session) === 'needs').length,
      unread: counted.filter((e) => statusOf(e.session) === 'unread').length,
      working: counted.filter((e) => statusOf(e.session) === 'working').length,
      hidden: entries.filter((e) => placeOf(e.session) === 'hidden').length,
      archived: entries.filter((e) => placeOf(e.session) === 'archived').length,
    },
    devices: facet(counted, deviceLabel, NO_ENVIRONMENT).map((device) => {
      const here = counted.filter((e) => deviceLabel(e) === device.label)
      const worktrees = facet(
        here.filter((e) => worktreeOf(e.session)),
        (e) => worktreeOf(e.session)!.label,
        '',
      ).map((f) => {
        const worktree = worktreeOf(here.find((e) => worktreeOf(e.session)?.label === f.label)!.session)!
        return { ...f, under: worktree.under, name: worktree.name, title: worktree.path, kind: 'worktree' as const }
      })
      const homes = facet(
        here.filter((e) => !worktreeOf(e.session)),
        folderLabel,
        UNKNOWN_FOLDER,
      ).map((f) => ({ ...f, kind: homeKind(here.find((e) => folderLabel(e) === f.label)!.session) }))
      const folders = withRepositories<Facet>([...homes, ...worktrees], (label) => ({
        label,
        count: 0,
        needs: 0,
        kind: 'repository',
      }))
      // Like the list: a lone "Unknown folder" is no second level.
      return { ...device, folders: folders.length === 1 && folders[0].label === UNKNOWN_FOLDER ? [] : folders }
    }),
    agents: agentsDiffer(counted.map((e) => e.session))
      ? facet(counted, agentLabel, '').sort((a, b) => compareAgents(a.label, b.label))
      : [],
    sources: facet(counted, sourceLabel, '').sort((a, b) => orderBy(SOURCE_ORDER)(a.label, b.label)),
    accounts: accountsDiffer(counted.map((e) => e.session)) ? facet(counted, accountLabel, UNKNOWN_ACCOUNT) : [],
  }
}

/** Folders where sessions of one daemon run on its own machine, or on one of its nodes (where a new
 *  session would start), the most used first: what the New session dialog suggests. */
export function folderSuggestions(entries: SessionEntry[], daemonId: string, node: string | null = null): Facet[] {
  const local = entries.filter(
    (e) => e.daemon.id === daemonId && (e.session.node ?? null) === node && e.session.on_host && folderOf(e.session),
  )
  return facet(local, (e) => folderOf(e.session) ?? '', '') // where to start one: real folders
}
