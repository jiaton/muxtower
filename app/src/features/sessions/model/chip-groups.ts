import { inProjectOrder } from './project-order'
/**
 * The second chip row: groups of projects the owner makes (kept on the hub, `GET/PUT /v1/chip-groups`),
 * or, while there are none, the most recently active projects one chip each. Chosen together with a view
 * of the first row (Focus + Needs you). A session counts under where it belongs (`belongs.ts`, as the list
 * groups it), named by `chipKeyOf`: its project, its folder's name, or Other.
 */
import { OTHER, OTHER_PLACE, chipKeyOf, belongingsOf, type Belongings } from './belongs'
import { placeOf, roleKeyOf, type SessionEntry } from './facets'

export { OTHER }
export const OTHER_LABEL = OTHER_PLACE
/** Project chips shown while there are no groups. */
export const AUTO_CHIPS = 6
/** As the hub takes them (`chips/service.py`). */
export const MAX_GROUPS = 20
export const MAX_PROJECTS = 40
export const MAX_NAME = 40
export const MAX_SESSIONS = 100
export const MAX_ROLES = 20

/** Projects held whole (sessions to come included), and single sessions besides (a fixed list). */
export interface ChipMembers {
  projects: string[]
  sessions: string[]
  /** Role keys (`roleKeyOf`: "pm"), each held in every project: a chip of every project's PM. */
  roles?: string[]
}

export interface ChipGroup extends ChipMembers {
  id: string
  name: string
}

export interface ProjectChip extends ChipMembers {
  /** The group's id, or `p:<project>` for a chip of one project (no groups). */
  id: string
  label: string
}

/** The chip project of an entry, by `places` (`belongingsOf` every known session). */
export const chipProjectOf = (entry: SessionEntry, places: Belongings) => chipKeyOf(places(entry))

export const projectLabel = (project: string) => (project === OTHER ? OTHER_LABEL : project)

/** The listed sessions' projects: those with a session needing the owner first, then the most recently
 *  active; Other last. */
export function projectsByActivity(entries: SessionEntry[]): string[] {
  const best = new Map<string, { needs: boolean; at: number }>()
  const places = belongingsOf(entries)
  for (const entry of entries) {
    const { session } = entry
    if (placeOf(session) !== 'listed') continue
    const project = chipProjectOf(entry, places)
    const seen = best.get(project) ?? { needs: false, at: 0 }
    best.set(project, { needs: seen.needs || session.needs_attention, at: Math.max(seen.at, Date.parse(session.updated_at) || 0) })
  }
  return [...best.entries()]
    .sort(([a, x], [b, y]) => Number(a === OTHER) - Number(b === OTHER) || Number(y.needs) - Number(x.needs) || y.at - x.at)
    .map(([project]) => project)
}

/** What the row shows: the groups in their order, else one chip per project, in the owner's order of projects
 *  (`order`, then by name; Other last), the same as the list; null when it would show a single project and no
 *  groups (no row, no height taken). */
export function projectChips(groups: ChipGroup[], entries: SessionEntry[], order: readonly string[] = []): ProjectChip[] | null {
  if (groups.length)
    return groups.map((g) => ({ id: g.id, label: g.name, projects: g.projects, sessions: g.sessions ?? [], roles: g.roles ?? [] }))
  const listed = projectsByActivity(entries)
  const projects = [
    ...inProjectOrder(
      listed.filter((p) => p !== OTHER),
      (p) => p,
      order,
    ),
    ...listed.filter((p) => p === OTHER),
  ]
  if (projects.length <= 1) return null
  return projects.slice(0, AUTO_CHIPS).map((p) => ({ id: `p:${p}`, label: projectLabel(p), projects: [p], sessions: [] }))
}

/** What a chip id from the URL holds: a group's members, or the one project of a `p:` chip; null for
 *  none (a group since deleted, or none chosen). */
export function chipMembers(id: string | undefined, groups: ChipGroup[]): ChipMembers | null {
  if (!id) return null
  if (id.startsWith('p:')) return { projects: [id.slice(2)], sessions: [] }
  const group = groups.find((g) => g.id === id)
  return group ? { projects: group.projects, sessions: group.sessions ?? [], roles: group.roles ?? [] } : null
}

/** Whether a chip holds a session: its project whole, its role (in any project), or the session itself. */
export function inChip(entry: SessionEntry, chip: ChipMembers, places: Belongings): boolean {
  if (chip.projects.includes(chipProjectOf(entry, places)) || chip.sessions.includes(entry.session.id)) return true
  const role = chip.roles?.length ? roleKeyOf(entry.session) : null
  return role !== null && chip.roles!.includes(role)
}

/** Whether a chip picks sessions by role: its rows then say which project each is in. */
export const byRole = (chip: ChipMembers | null | undefined) => Boolean(chip?.roles?.length)
