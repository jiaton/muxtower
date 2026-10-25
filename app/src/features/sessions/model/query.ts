/**
 * What the session list shows: a view (what needs you, what works, everything), optionally narrowed to
 * one device or folder and a search, grouped by status, device or folder. Lives in the URL, so back,
 * reload and links keep it.
 */
import { OTHER_DEVICES, STATUSES, UNKNOWN_FOLDER, deviceOf, folderOf, isAssistant, statusOf, type SessionEntry } from './facets'

export const VIEWS = ['all', 'needs', 'working'] as const
export const GROUPINGS = ['status', 'device', 'folder', 'none'] as const
export type View = (typeof VIEWS)[number]
export type GroupBy = (typeof GROUPINGS)[number]

export interface SessionQuery {
  view: View
  group: GroupBy
  /** A device label, or OTHER_DEVICES. */
  device?: string
  /** A folder (as `folderOf` shows it), or UNKNOWN_FOLDER. */
  folder?: string
  q?: string
}

export const VIEW_LABEL: Record<View, string> = { all: 'All sessions', needs: 'Needs you', working: 'Working' }
export const GROUP_LABEL: Record<GroupBy, string> = { status: 'Status', device: 'Device', folder: 'Folder', none: 'None' }

const deviceLabel = (entry: SessionEntry) => deviceOf(entry.session) ?? OTHER_DEVICES
const folderLabel = (entry: SessionEntry) => folderOf(entry.session) ?? UNKNOWN_FOLDER

function matchesText(entry: SessionEntry, q: string): boolean {
  const { session } = entry
  const haystack = [session.name, folderLabel(entry), deviceLabel(entry), session.summary?.detail, session.summary?.recent]
  return haystack.some((text) => text?.toLowerCase().includes(q))
}

export function filterEntries(entries: SessionEntry[], query: SessionQuery): SessionEntry[] {
  const q = query.q?.trim().toLowerCase()
  return entries.filter((entry) => {
    const status = statusOf(entry.session)
    if (query.view === 'needs' && status !== 'needs') return false
    if (query.view === 'working' && status !== 'working') return false
    if (query.device && deviceLabel(entry) !== query.device) return false
    if (query.folder && folderLabel(entry) !== query.folder) return false
    return !q || matchesText(entry, q)
  })
}

/** What needs you first (longest waiting first), then the most recently active. */
export function compareEntries(a: SessionEntry, b: SessionEntry): number {
  const aNeeds = a.session.needs_attention
  const bNeeds = b.session.needs_attention
  if (aNeeds !== bNeeds) return aNeeds ? -1 : 1
  const time = (e: SessionEntry) => Date.parse(e.session.updated_at)
  return aNeeds ? time(a) - time(b) : time(b) - time(a)
}

export interface Group {
  key: string
  label: string
  entries: SessionEntry[]
}

const STATUS_ORDER = new Map(STATUSES.map((s, i) => [s.id, i]))

/** Groups in display order; the assistant, when there is one, is pinned in a group of its own. */
export function groupEntries(entries: SessionEntry[], by: GroupBy): Group[] {
  const sorted = [...entries].sort(compareEntries)
  const pinned = sorted.filter((e) => isAssistant(e.session))
  const rest = sorted.filter((e) => !isAssistant(e.session))
  const groups: Group[] = pinned.length ? [{ key: 'assistant', label: 'Assistant', entries: pinned }] : []
  if (by === 'none') return rest.length ? [...groups, { key: 'all', label: 'Sessions', entries: rest }] : groups

  const keyOf = (entry: SessionEntry) =>
    by === 'status' ? statusOf(entry.session) : by === 'device' ? deviceLabel(entry) : folderLabel(entry)
  const byKey = new Map<string, SessionEntry[]>()
  for (const entry of rest) byKey.set(keyOf(entry), [...(byKey.get(keyOf(entry)) ?? []), entry])

  const labelOf = (key: string) => (by === 'status' ? STATUSES.find((s) => s.id === key)!.label : key)
  const last = by === 'device' ? OTHER_DEVICES : UNKNOWN_FOLDER
  const order = (key: string) => (by === 'status' ? (STATUS_ORDER.get(key as never) ?? 99) : key === last ? Number.MAX_SAFE_INTEGER : 0)
  const keys = [...byKey.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  return [...groups, ...keys.map((key) => ({ key, label: labelOf(key), entries: byKey.get(key)! }))]
}

export interface Facet {
  label: string
  count: number
  /** How many of them need you. */
  needs: number
}

export interface Facets {
  views: Record<View, number>
  devices: Facet[]
  folders: Facet[]
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

/** Counts for the navigation: per view, per device, per folder (the assistant is not counted). */
export function facetsOf(entries: SessionEntry[]): Facets {
  const counted = entries.filter((e) => !isAssistant(e.session))
  return {
    views: {
      all: counted.length,
      needs: counted.filter((e) => statusOf(e.session) === 'needs').length,
      working: counted.filter((e) => statusOf(e.session) === 'working').length,
    },
    devices: facet(counted, deviceLabel, OTHER_DEVICES),
    folders: facet(counted, folderLabel, UNKNOWN_FOLDER),
  }
}

/** A title for what the list shows. */
export function queryTitle(query: SessionQuery): string {
  return query.device ?? query.folder ?? VIEW_LABEL[query.view]
}

/** Whether a "show all" toggle is worth having for a list of `count` showing `shown`. */
export const toggleable = (count: number, shown: number) => count > shown
