/** The session list's URL search params ↔ its query. Defaults are left out of the URL. */
import { GROUPINGS, VIEWS, type GroupBy, type SessionQuery, type View } from './query'

export interface ListSearch {
  view?: View
  group?: GroupBy
  device?: string
  folder?: string
  agent?: string
  source?: string
  account?: string
  q?: string
}

const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

export function parseListSearch(raw: Record<string, unknown>): ListSearch {
  return {
    view: pick(raw.view, VIEWS),
    group: pick(raw.group, GROUPINGS),
    device: text(raw.device),
    folder: text(raw.folder),
    agent: text(raw.agent),
    source: text(raw.source),
    account: text(raw.account),
    q: text(raw.q),
  }
}

export const toQuery = (search: ListSearch, defaultGroup: GroupBy): SessionQuery => ({
  view: search.view ?? 'all',
  group: search.group ?? pick(defaultGroup, GROUPINGS) ?? 'status',
  device: search.device,
  folder: search.folder,
  agent: search.agent,
  source: search.source,
  account: search.account,
  q: search.q,
})

export interface Scope {
  view?: View
  device?: string
  folder?: string
  agent?: string
  source?: string
  account?: string
}

/** Search params for a scope chosen in the navigation: a view, a device (and one of its folders), an
 *  agent, a source or an account. Grouping and search text stay. */
export const scopeSearch = (current: ListSearch, scope: Scope): ListSearch => ({
  group: current.group,
  q: current.q,
  view: scope.view === 'all' ? undefined : scope.view,
  device: scope.device,
  folder: scope.folder,
  agent: scope.agent,
  source: scope.source,
  account: scope.account,
})

/** The scope a query is narrowed to, if any. */
export const scopeOf = (query: SessionQuery): Scope | null =>
  query.device || query.folder || query.agent || query.source || query.account
    ? { device: query.device, folder: query.folder, agent: query.agent, source: query.source, account: query.account }
    : null

/** Whether the list shows exactly this scope (the sidebar's current entry). */
export function isCurrentScope(search: ListSearch, scope: Scope): boolean {
  const view = search.view ?? 'all'
  if (scope.view) return !search.device && !search.folder && !search.agent && !search.source && !search.account && view === scope.view
  return (
    search.device === scope.device &&
    search.folder === scope.folder &&
    search.agent === scope.agent &&
    search.source === scope.source &&
    search.account === scope.account &&
    view === 'all'
  )
}
