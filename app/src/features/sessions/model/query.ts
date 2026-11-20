/**
 * What the session list shows: a view (what needs you, what works, everything), optionally narrowed to
 * one device (and one of its folders), one agent, one source or one account, and a search; grouped by
 * status, by device and folder, by agent or by account (each offered only when there is more than one),
 * or by source. Lives in the URL, so back, reload and links keep it.
 */
import type { ChipMembers } from './chip-groups'
import { filterEntries } from './filter'
import { compareInProject, orderPlaces } from './project-order'
import { nestFolders, withRepositories } from './folders'
import { anchorOf, homeKind, homeOf, worktreeOf, type PlaceKind } from './places'
import {
  NO_ENVIRONMENT,
  folderName,
  placeGroupOf,
  shortFolderNames,
  SOURCES,
  STATUSES,
  UNKNOWN_ACCOUNT,
  UNKNOWN_FOLDER,
  accountOf,
  agentOf,
  compareAgents,
  deviceOf,
  isAssistant,
  projectGroupOf,
  roleKeyOf,
  roleLabels,
  sourceOf,
  statusOf,
  type Place,
  type SessionEntry,
} from './facets'

/** What the list shows; hidden and archived sessions are only in their own view, and counted nowhere else. */
export const VIEWS = ['all', 'needs', 'unread', 'working', 'hidden', 'archived', 'interrupted'] as const
export const GROUPINGS = ['status', 'project', 'role', 'device', 'agent', 'source', 'account', 'none'] as const
export type View = (typeof VIEWS)[number]
export type GroupBy = (typeof GROUPINGS)[number]

export interface SessionQuery {
  view: View
  group: GroupBy
  /** A device label, or NO_ENVIRONMENT. */
  device?: string
  /** A folder (as `folderOf` shows it), or UNKNOWN_FOLDER; usually together with its device. */
  folder?: string
  /** An agent label (`agentOf`). */
  agent?: string
  /** A source label (`sourceOf`). */
  source?: string
  /** An account label (`accountOf`). */
  account?: string
  /** A project (`projectGroupOf`). */
  project?: string
  q?: string
  /** What the chosen chip of the second row holds (`chip-groups.ts`). */
  chip?: ChipMembers
}

export const VIEW_LABEL: Record<View, string> = {
  all: 'All sessions',
  needs: 'Needs you',
  unread: 'Unread',
  working: 'Working',
  hidden: 'Hidden',
  archived: 'Archived',
  interrupted: 'Interrupted',
}

/** Views of sessions set aside (`Place`), reached from a menu rather than the tabs. */
export const ASIDE_VIEWS: readonly View[] = ['hidden', 'archived', 'interrupted']

/** Where the sessions a view shows are listed. */
export const placeIn = (view: View): Place => (view === 'hidden' || view === 'archived' || view === 'interrupted' ? view : 'listed')
export const GROUP_LABEL: Record<GroupBy, string> = {
  status: 'Status',
  project: 'Project',
  role: 'Role',
  device: 'Device and folder',
  agent: 'Agent',
  source: 'Source',
  account: 'Account',
  none: 'None',
}

export const deviceLabel = (entry: SessionEntry) => deviceOf(entry.session) ?? NO_ENVIRONMENT
/** Where it is listed under its device (`homeOf`: its project, repository or folder), or UNKNOWN_FOLDER. */
export const folderLabel = (entry: SessionEntry) => homeOf(entry.session) ?? UNKNOWN_FOLDER
export const agentLabel = (entry: SessionEntry) => agentOf(entry.session)
export const sourceLabel = (entry: SessionEntry) => sourceOf(entry.session)
export const accountLabel = (entry: SessionEntry) => accountOf(entry.session)
export const projectLabel = (entry: SessionEntry) => projectGroupOf(entry.session)

/** The groups of the list by project: each entry's group key and label, and each folder group's paths.
 *  A folder is grouped by its name, the same name on several machines one group; where one machine has two
 *  folders of that name, each is named with as much of its path as tells them apart. */
export function placeGroups(entries: SessionEntry[]): {
  keyOf: Map<string, string>
  label: Map<string, string>
  kind: Map<string, 'project' | 'folder' | 'other'>
  paths: Map<string, string[]>
} {
  const keyOf = new Map<string, string>()
  const label = new Map<string, string>()
  const kind = new Map<string, 'project' | 'folder' | 'other'>()
  const paths = new Map<string, string[]>()
  const folders = entries.flatMap((e) => {
    const place = placeGroupOf(e.session)
    return place.kind === 'folder' ? [{ e, path: place.name, machine: deviceLabel(e), name: folderName(place.name) }] : []
  })
  // A name two folders of one machine share: those folders get longer names.
  const clash = new Set<string>()
  const seen = new Map<string, string>() // machine + name → its path
  for (const f of folders) {
    const at = `${f.machine} ${f.name}`
    if (seen.has(at) && seen.get(at) !== f.path) clash.add(f.name)
    else seen.set(at, f.path)
  }
  const longer = shortFolderNames([...new Set(folders.filter((f) => clash.has(f.name)).map((f) => f.path))])
  for (const e of entries) {
    const place = placeGroupOf(e.session)
    const name =
      place.kind === 'folder'
        ? clash.has(folderName(place.name))
          ? (longer.get(place.name) ?? place.name)
          : folderName(place.name)
        : place.name
    const key = `${place.kind}:${name}`
    keyOf.set(e.key, key)
    label.set(key, name)
    kind.set(key, place.kind)
    if (place.kind === 'folder') paths.set(key, [...new Set([...(paths.get(key) ?? []), place.name])])
  }
  return { keyOf, label, kind, paths }
}

export { filterEntries }

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
  agent?: boolean
  source?: boolean
  account?: boolean
  /** A project's group: its sessions run on several devices, each row says which (a tag). */
  project?: boolean
  /** A role's group: the same role in several projects, each row says which project (a tag). */
  role?: boolean
}

/** The group of sessions with no role, last when grouping by role. */
export const NO_ROLE = 'No role'

export interface Section {
  key: string
  label: string
  /** The full name when `label` is shortened. */
  title?: string
  /** What kind of place a device's section is: a project, a repository, one of its worktrees, a folder. */
  kind?: PlaceKind
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
export const SOURCE_ORDER = new Map(SOURCES.map((s, i) => [s as string, i]))

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
export const orderBy = (order: Map<string, number>, last?: string) => (a: string, b: string) =>
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
  const byFolder = bucket(entries, (e) => worktreeOf(e.session)?.label ?? folderLabel(e))
  if (byFolder.size === 1 && byFolder.has(UNKNOWN_FOLDER)) return undefined
  type Item = {
    label: string
    count: number
    entries: SessionEntry[]
    under?: string
    name?: string
    title?: string
    kind: PlaceKind
    at?: string
  }
  const folders = withRepositories<Item>(
    [...byFolder].map(([label, entries]) => {
      const worktree = worktreeOf(entries[0].session)
      const kind = worktree ? 'worktree' : homeKind(entries[0].session)
      const at = worktree ? undefined : anchorOf(entries[0].session)
      return { label, count: entries.length, entries, under: worktree?.under, name: worktree?.name, title: worktree?.path, kind, at }
    }),
    (label) => ({ label, count: 0, entries: [], kind: 'repository' }),
  )
  return nestFolders(folders, UNKNOWN_FOLDER).map(({ item, depth, parent, name, total }) => ({
    key: item.label,
    label: item.label,
    title: item.title,
    kind: item.kind,
    entries: item.entries,
    depth,
    parent,
    name,
    total,
  }))
}

/** Groups in display order: the assistant, when there is one, in a group of its own at the top, then
 *  what the owner pinned, then the rest; by project, in `projectOrder` (the owner's, `project-order.ts`). */
export function groupEntries(entries: SessionEntry[], by: GroupBy, projectOrder: readonly string[] = []): Group[] {
  const sorted = [...entries].sort(compareEntries)
  const assistant = sorted.filter((e) => isAssistant(e.session))
  const pinned = sorted.filter((e) => !isAssistant(e.session) && e.session.pinned)
  const rest = sorted.filter((e) => !isAssistant(e.session) && !e.session.pinned)
  const groups: Group[] = [
    ...(assistant.length ? [{ key: 'assistant', label: 'Assistant', entries: assistant, implies: {} }] : []),
    ...(pinned.length ? [{ key: 'pinned', label: 'Pinned', entries: pinned, implies: {} }] : []),
  ]
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

  if (by === 'project') {
    // A stable order (`project-order.ts`): nothing moves for what the sessions do.
    const inGroup = [...rest].sort(compareInProject)
    const places = placeGroups(inGroup)
    const byPlace = bucket(inGroup, (e) => places.keyOf.get(e.key)!)
    const keys = orderPlaces(
      [...byPlace.keys()],
      (k) => places.kind.get(k)!,
      (k) => places.label.get(k)!,
      projectOrder,
    )
    return [
      ...groups,
      ...keys.map((key) => ({
        key,
        label: places.label.get(key)!,
        title: places.paths.get(key)?.join('\n'),
        kind:
          places.kind.get(key) === 'folder' ? ('folder' as const) : places.kind.get(key) === 'project' ? ('project' as const) : undefined,
        entries: byPlace.get(key)!,
        implies: { project: true },
      })),
    ]
  }

  if (by === 'role') {
    const labels = roleLabels(rest.map((e) => e.session))
    const byRole = bucket(rest, (e) => roleKeyOf(e.session) ?? NO_ROLE)
    const keys = bySize(byRole, NO_ROLE)
    return [
      ...groups,
      ...keys.map((key) => ({
        key: `role:${key}`,
        label: labels.get(key) ?? key,
        entries: byRole.get(key)!,
        implies: { role: key !== NO_ROLE },
      })),
    ]
  }

  if (by === 'agent') {
    const byAgent = bucket(rest, agentLabel)
    const keys = [...byAgent.keys()].sort(compareAgents)
    return [...groups, ...keys.map((key) => ({ key, label: key, entries: byAgent.get(key)!, implies: { agent: true } }))]
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

/** A title for what the list shows, and where that is when the title is a folder. */
export function queryTitle(query: SessionQuery): { title: string; within?: string } {
  if (query.folder) return { title: query.folder, within: query.device }
  return { title: query.project ?? query.device ?? query.agent ?? query.source ?? query.account ?? VIEW_LABEL[query.view] }
}

/** Whether a "show all" toggle is worth having for a list of `count` showing `shown`: not for one more
 *  line, which shows in the room the toggle would take. */
export const toggleable = (count: number, shown: number) => count > shown + 1

/** The one session a scope holds, to open with it (a click on the scope, side by side with the list):
 *  none when it holds more or fewer, or holds the session already open. */
export function soleSession(entries: SessionEntry[], query: SessionQuery, openKey?: string): SessionEntry | null {
  const shown = filterEntries(entries, query).filter((e) => !isAssistant(e.session))
  return shown.length === 1 && shown[0].key !== openKey ? shown[0] : null
}
