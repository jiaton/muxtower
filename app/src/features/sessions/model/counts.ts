/** Counts for the navigation (per view, device and folder, source, account) and the folders a new
 *  session is offered, over the same labels as the list's query. */
import {
  NO_ENVIRONMENT,
  UNKNOWN_ACCOUNT,
  UNKNOWN_FOLDER,
  accountsDiffer,
  folderOf,
  isAssistant,
  placeOf,
  statusOf,
  type SessionEntry,
} from './facets'
import { SOURCE_ORDER, accountLabel, deviceLabel, folderLabel, orderBy, sourceLabel, type View } from './query'

export interface Facet {
  label: string
  count: number
  /** How many of them need you. */
  needs: number
}

export interface DeviceFacet extends Facet {
  folders: Facet[]
}

export interface Facets {
  views: Record<View, number>
  /** Each device with its folders: where things run, then what they work on. */
  devices: DeviceFacet[]
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

/** Counts for the navigation: per view, per device and its folders, per source. The assistant is not
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
      const folders = facet(
        counted.filter((e) => deviceLabel(e) === device.label),
        folderLabel,
        UNKNOWN_FOLDER,
      )
      // Like the list: a lone "Unknown folder" is no second level.
      return { ...device, folders: folders.length === 1 && folders[0].label === UNKNOWN_FOLDER ? [] : folders }
    }),
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
  return facet(local, folderLabel, '')
}
