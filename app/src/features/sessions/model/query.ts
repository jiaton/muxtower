/**
 * What the session list shows: a view (what needs you, what works, everything), optionally narrowed to
 * one device (and one of its folders), one source or one account, and a search; grouped by status, by
 * device and folder, by source or by account (offered only when there is more than one). Lives in the URL, so back, reload and links keep it.
 */
import { nestFolders } from './folders'
import {
  NO_ENVIRONMENT,
  SOURCES,
  STATUSES,
  UNKNOWN_ACCOUNT,
  UNKNOWN_FOLDER,
  accountOf,
  accountsDiffer,
  deviceOf,
  folderOf,
  isAssistant,
  placeOf,
  sourceOf,
  statusOf,
  type Place,
  type SessionEntry,
} from './facets'

/** What the list shows; hidden and archived sessions are only in their own view, and counted nowhere else. */
export const VIEWS = ['all', 'needs', 'unread', 'working', 'hidden', 'archived'] as const
export const GROUPINGS = ['status', 'device', 'source', 'account', 'none'] as const
export type View = (typeof VIEWS)[number]
export type GroupBy = (typeof GROUPINGS)[number]

export interface SessionQuery {
  view: View
  group: GroupBy
  /** A device label, or NO_ENVIRONMENT. */
  device?: string
  /** A folder (as `folderOf` shows it), or UNKNOWN_FOLDER; usually together with its device. */
  folder?: string
  /** A source label (`sourceOf`). */
  source?: string
  /** An account label (`accountOf`). */
  account?: string
  q?: string
}

export const VIEW_LABEL: Record<View, string> = {
  all: 'All sessions',
  needs: 'Needs you',
  unread: 'Unread',
  working: 'Working',
  hidden: 'Hidden',
  archived: 'Archived',
}

/** Views of sessions set aside (`Place`), reached from a menu rather than the tabs. */
export const ASIDE_VIEWS: readonly View[] = ['hidden', 'archived']

/** Where the sessions a view shows are listed. */
export const placeIn = (view: View): Place => (view === 'hidden' || view === 'archived' ? view : 'listed')
export const GROUP_LABEL: Record<GroupBy, string> = {
  status: 'Status',
  device: 'Device and folder',
  source: 'Source',
  account: 'Account',
  none: 'None',
}

export const deviceLabel = (entry: SessionEntry) => deviceOf(entry.session) ?? NO_ENVIRONMENT
export const folderLabel = (entry: SessionEntry) => folderOf(entry.session) ?? UNKNOWN_FOLDER
const sourceLabel = (entry: SessionEntry) => sourceOf(entry.session)
const accountLabel = (entry: SessionEntry) => accountOf(entry.session)

function matchesText(entry: SessionEntry, q: string): boolean {
  const { session } = entry
  const haystack = [
    session.name,
    folderLabel(entry),
    deviceLabel(entry),
    sourceLabel(entry),
    session.account,
    session.summary?.detail,
    session.summary?.recent,
  ]
  return haystack.some((text) => text?.toLowerCase().includes(q))
}

export function filterEntries(entries: SessionEntry[], query: SessionQuery): SessionEntry[] {
  const q = query.q?.trim().toLowerCase()
  return entries.filter((entry) => {
    const status = statusOf(entry.session)
    if (placeOf(entry.session) !== placeIn(query.view)) return false
    if (placeIn(query.view) === 'listed' && query.view !== 'all' && status !== query.view) return false
    if (query.device && deviceLabel(entry) !== query.device) return false
    if (query.folder && folderLabel(entry) !== query.folder) return false
    if (query.source && sourceLabel(entry) !== query.source) return false
    if (query.account && accountLabel(entry) !== query.account) return false
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

/** What every row of a group shares, so rows need not repeat it. */
export interface Implied {
  device?: boolean
  folder?: boolean
  source?: boolean
  account?: boolean
}

export interface Section {
  key: string
  label: string
  /** The full name when `label` is shortened. */
  title?: string
  entries: SessionEntry[]
  /** In a tree of folders (`nestFolders`): how deep, the folder it lies in, its name there, and how many
   *  sessions it holds with the folders inside it. */
  depth?: number
  parent?: string
  name?: string
  total?: number
}

export interface Group extends Section {
  implies: Implied
  /** A second level (a device's folders); `entries` then holds all of them, in section order. */
  sections?: Section[]
}

const STATUS_ORDER = new Map(STATUSES.map((s, i) => [s.id as string, i]))
const SOURCE_ORDER = new Map(SOURCES.map((s, i) => [s as string, i]))

/** Buckets in first-seen order of an already sorted list. */
function bucket(entries: SessionEntry[], keyOf: (e: SessionEntry) => string): Map<string, SessionEntry[]> {
  const byKey = new Map<string, SessionEntry[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    byKey.set(key, [...(byKey.get(key) ?? []), entry])
  }
  return byKey
}

/** Known labels in their order, then the rest by name, with `last` (the unknown one) at the end. */
const orderBy = (order: Map<string, number>, last?: string) => (a: string, b: string) =>
  Number(a === last) - Number(b === last) || (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b)

/** Keys of a bucketing: the most entries first, `last` (the unknown one) at the end; the same order
 *  as the sidebar's counts. */
const bySize = (byKey: Map<string, SessionEntry[]>, last: string) =>
  [...byKey.keys()].sort(
    (a, b) => Number(a === last) - Number(b === last) || byKey.get(b)!.length - byKey.get(a)!.length || a.localeCompare(b),
  )

/** Folders of one device, as a tree (`nestFolders`); none when no folder is known (a lone "Unknown
 *  folder" says nothing). */
function folderSections(entries: SessionEntry[]): Section[] | undefined {
  const byFolder = bucket(entries, folderLabel)
  if (byFolder.size === 1 && byFolder.has(UNKNOWN_FOLDER)) return undefined
  const folders = [...byFolder].map(([label, entries]) => ({ label, count: entries.length, entries }))
  return nestFolders(folders, UNKNOWN_FOLDER).map(({ item, depth, parent, name, total }) => ({
    key: item.label,
    label: item.label,
    entries: item.entries,
    depth,
    parent,
    name,
    total,
  }))
}

/** Groups in display order; the assistant, when there is one, is pinned in a group of its own. */
export function groupEntries(entries: SessionEntry[], by: GroupBy): Group[] {
  const sorted = [...entries].sort(compareEntries)
  const pinned = sorted.filter((e) => isAssistant(e.session))
  const rest = sorted.filter((e) => !isAssistant(e.session))
  const groups: Group[] = pinned.length ? [{ key: 'assistant', label: 'Assistant', entries: pinned, implies: {} }] : []
  if (!rest.length) return groups
  if (by === 'none') return [...groups, { key: 'all', label: 'Sessions', entries: rest, implies: {} }]

  if (by === 'device') {
    const byDevice = bucket(rest, deviceLabel)
    return [
      ...groups,
      ...bySize(byDevice, NO_ENVIRONMENT).map((key) => {
        const sections = folderSections(byDevice.get(key)!)
        const entries = sections ? sections.flatMap((s) => s.entries) : byDevice.get(key)!
        return { key, label: key, implies: { device: true, folder: Boolean(sections) }, sections, entries }
      }),
    ]
  }

  if (by === 'account') {
    const byAccount = bucket(rest, accountLabel)
    const keys = bySize(byAccount, UNKNOWN_ACCOUNT)
    return [...groups, ...keys.map((key) => ({ key, label: key, entries: byAccount.get(key)!, implies: { account: true } }))]
  }

  const keyOf = by === 'status' ? (e: SessionEntry) => statusOf(e.session) : sourceLabel
  const byKey = bucket(rest, keyOf)
  const keys = [...byKey.keys()].sort(orderBy(by === 'status' ? STATUS_ORDER : SOURCE_ORDER))
  const labelOf = (key: string) => (by === 'status' ? STATUSES.find((s) => s.id === key)!.label : key)
  return [...groups, ...keys.map((key) => ({ key, label: labelOf(key), entries: byKey.get(key)!, implies: { source: by === 'source' } }))]
}

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

/** A title for what the list shows, and where that is when the title is a folder. */
export function queryTitle(query: SessionQuery): { title: string; within?: string } {
  if (query.folder) return { title: query.folder, within: query.device }
  return { title: query.device ?? query.source ?? query.account ?? VIEW_LABEL[query.view] }
}

/** Whether a "show all" toggle is worth having for a list of `count` showing `shown`. */
export const toggleable = (count: number, shown: number) => count > shown
