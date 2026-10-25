/** The session list's URL search params ↔ its query. Defaults are left out of the URL. */
import { GROUPINGS, VIEWS, type GroupBy, type SessionQuery, type View } from './query'

export interface ListSearch {
  view?: View
  group?: GroupBy
  device?: string
  folder?: string
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
    q: text(raw.q),
  }
}

export const toQuery = (search: ListSearch, defaultGroup: GroupBy): SessionQuery => ({
  view: search.view ?? 'all',
  group: search.group ?? defaultGroup,
  device: search.device,
  folder: search.folder,
  q: search.q,
})

/** Search params for a scope chosen in the navigation: a view, or one device, or one folder. */
export const scopeSearch = (current: ListSearch, scope: { view?: View; device?: string; folder?: string }): ListSearch => ({
  group: current.group,
  q: current.q,
  view: scope.view === 'all' ? undefined : scope.view,
  device: scope.device,
  folder: scope.folder,
})
