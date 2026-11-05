/** A project's team, as a card shows it: every known session of the project (team project, `my_team`'s),
 *  on every device, not only the one whose row it is shown on. */
import { compareEntries } from './query'
import { placeOf, type SessionEntry } from './facets'

/** The team project of the sessions a row lists, when they all have the same one (not a workspace, whose
 *  row holds several). */
export function projectOfRow(rowEntries: SessionEntry[]): string | null {
  const projects = new Set(rowEntries.map((e) => e.session.project ?? null))
  const [only] = projects
  return projects.size === 1 ? only : null
}

/** The sessions of a project, those needing the owner first, then the most recently active. Archived
 *  and interrupted ones are no team members. */
export function teamOf(entries: SessionEntry[], project: string): SessionEntry[] {
  return entries
    .filter((e) => e.session.project === project && (placeOf(e.session) === 'listed' || placeOf(e.session) === 'hidden'))
    .sort(compareEntries)
}

/** Where a new session of the project starts: the folder of its latest session on that device (its
 *  repository's main folder, else where the project sits, else its folder). */
export function folderToStart(members: SessionEntry[], device?: string): { entry: SessionEntry; cwd: string } | null {
  const entry = members.find((m) => !device || (m.session.machine ?? '') === device) ?? members[0]
  if (!entry) return null
  const s = entry.session
  return { entry, cwd: s.git?.repo ?? s.project_anchor ?? s.cwd ?? '' }
}
