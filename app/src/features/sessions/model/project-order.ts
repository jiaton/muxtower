/**
 * The list grouped by project keeps a stable order: groups and rows hold their place whatever the sessions
 * do (state shows as icons, badges and counts, never as a move). Projects come in the owner's order (kept on
 * the hub, `/v1/project-order`, the same on every device), those it does not hold yet after them by name;
 * then folder groups by name, then Other. Inside a group: a PM or a lead first, then the rest, each by when
 * it was created, so a new session takes its place rather than the top.
 */
import { roleKeyOf, type SessionEntry } from './facets'

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || a.localeCompare(b)

/** A role that leads its project: PM, lead, or any "… lead" (tech lead). */
export function leads(entry: SessionEntry): boolean {
  const role = roleKeyOf(entry.session)
  return role !== null && (role === 'pm' || role === 'lead' || role.endsWith(' lead'))
}

const created = (e: SessionEntry) => Date.parse(e.session.created_at ?? '') || 0

/** Inside a project: who leads first, then the rest, each in the order they were created. */
export function compareInProject(a: SessionEntry, b: SessionEntry): number {
  return Number(leads(b)) - Number(leads(a)) || created(a) - created(b) || a.key.localeCompare(b.key)
}

export type PlaceGroupKind = 'project' | 'folder' | 'other'
const RANK: Record<PlaceGroupKind, number> = { project: 0, folder: 1, other: 2 }

/** The groups' keys in their stable order: projects as `order` puts them (by name), the others after by name,
 *  then folders by name, then Other. */
export function orderPlaces(
  keys: string[],
  kind: (key: string) => PlaceGroupKind,
  label: (key: string) => string,
  order: readonly string[],
): string[] {
  const at = new Map(order.map((name, i) => [name, i]))
  const place = (key: string) => (kind(key) === 'project' ? (at.get(label(key)) ?? Infinity) : Infinity)
  return [...keys].sort((a, b) => {
    const ranked = RANK[kind(a)] - RANK[kind(b)]
    if (ranked) return ranked
    const pa = place(a)
    const pb = place(b)
    if (pa !== pb) return pa < pb ? -1 : 1
    return byName(label(a), label(b))
  })
}

/** The order to keep once the projects shown were put in this order (`shown`, first to last): each shown
 *  project takes, in turn, the places the shown ones held in the order, so one not shown now (another view, a
 *  filter) keeps its place; shown projects the order did not hold yet are added at its end. */
export function keptOrder(stored: readonly string[], shown: readonly string[]): string[] {
  const all = [...stored, ...shown.filter((name) => !stored.includes(name))]
  const taken = new Set(shown)
  let next = 0
  return all.map((name) => (taken.has(name) ? shown[next++]! : name))
}
