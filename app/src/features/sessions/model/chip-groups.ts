/**
 * The second chip row: groups of projects the owner makes (kept on the hub, `GET/PUT /v1/chip-groups`),
 * or, while there are none, the most recently active projects one chip each. Chosen together with a view
 * of the first row (Focus + Needs you). A session's project is the one set for it (set_project), else its
 * repository's, else its folder's name; a session with none of these, in the home folder, `/`, a temp
 * folder or no folder at all, is in Other.
 */
import type { Session } from '@/lib/api/types'
import { folderName, folderOf, placeOf, type SessionEntry } from './facets'

/** The pseudo project of sessions that have none (as the hub keeps it in a group). */
export const OTHER = ':other'
export const OTHER_LABEL = 'Other'
/** Project chips shown while there are no groups. */
export const AUTO_CHIPS = 6
/** As the hub takes them (`chips/service.py`). */
export const MAX_GROUPS = 20
export const MAX_PROJECTS = 40
export const MAX_NAME = 40

export interface ChipGroup {
  id: string
  name: string
  projects: string[]
}

export interface ProjectChip {
  /** The group's id, or `p:<project>` for a chip of one project (no groups). */
  id: string
  label: string
  projects: string[]
}

const TEMP = /^\/(?:private\/)?(?:tmp|var\/folders)(?:\/|$)/

/** Whether a folder holds no project of its own: home, `/`, a temp folder, or none. */
export function isNoPlace(cwd: string | null | undefined): boolean {
  if (!cwd?.trim()) return true
  const folder = folderOf({ cwd } as Session)
  return folder === null || folder === '~' || folder === '/' || TEMP.test(cwd)
}

/** The project a session counts under in the chips. */
export function chipProject(session: Session): string {
  if (session.project && session.project_source === 'set') return session.project
  if (session.git) return session.project && session.project_source !== 'folder' ? session.project : folderName(session.git.repo)
  if (isNoPlace(session.cwd)) return OTHER
  return session.project ?? folderName(folderOf(session) ?? '') ?? OTHER
}

export const projectLabel = (project: string) => (project === OTHER ? OTHER_LABEL : project)

/** The listed sessions' projects: those with a session needing the owner first, then the most recently
 *  active; Other last. */
export function projectsByActivity(entries: SessionEntry[]): string[] {
  const best = new Map<string, { needs: boolean; at: number }>()
  for (const { session } of entries) {
    if (placeOf(session) !== 'listed') continue
    const project = chipProject(session)
    const seen = best.get(project) ?? { needs: false, at: 0 }
    best.set(project, { needs: seen.needs || session.needs_attention, at: Math.max(seen.at, Date.parse(session.updated_at) || 0) })
  }
  return [...best.entries()]
    .sort(([a, x], [b, y]) => Number(a === OTHER) - Number(b === OTHER) || Number(y.needs) - Number(x.needs) || y.at - x.at)
    .map(([project]) => project)
}

/** What the row shows: the groups in their order, else one chip per recent project; null when it would
 *  show a single project and no groups (no row, no height taken). */
export function projectChips(groups: ChipGroup[], entries: SessionEntry[]): ProjectChip[] | null {
  if (groups.length) return groups.map((g) => ({ id: g.id, label: g.name, projects: g.projects }))
  const projects = projectsByActivity(entries)
  if (projects.length <= 1) return null
  return projects.slice(0, AUTO_CHIPS).map((p) => ({ id: `p:${p}`, label: projectLabel(p), projects: [p] }))
}

/** The projects a chip id from the URL means: a group's, or the one of a `p:` chip; null for none (a
 *  group since deleted, or none chosen). */
export function chipProjects(id: string | undefined, groups: ChipGroup[]): string[] | null {
  if (!id) return null
  if (id.startsWith('p:')) return [id.slice(2)]
  return groups.find((g) => g.id === id)?.projects ?? null
}

export const inProjects = (entry: SessionEntry, projects: string[]) => projects.includes(chipProject(entry.session))
