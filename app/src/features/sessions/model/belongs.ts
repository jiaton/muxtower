/**
 * Where a session belongs: the one rule every view places a session by (the list grouped by project, the
 * chips, their group dialog and what each holds, ⌘K's project tag and `project:` term, a row's project tag,
 * the sidebar's projects). Nothing else works out a session's project or its folder group.
 *
 * 1. Its project as the hub keeps it, whatever gave it (set by an agent or the owner, or worked out from git:
 *    `project_source` "set", "git remote", "git root"), else its git repository (`projectGroupOf`). Where it
 *    started (`cwd`) does not matter then: a project started in a workspace is that project.
 * 2. Else its folder (a project the hub worked out only from a folder's name is that folder, said as one),
 *    unless the folder holds no project: home, `/`, a temp folder, none, or a workspace (a folder holding
 *    other sessions' projects, `workspaces.ts`).
 * 3. Else Other.
 *
 * A workspace is known only from the other sessions, so places are worked out over every known session
 * (`belongingsOf` the whole list), never over a filtered part of it.
 */
import type { Session } from '@/lib/api/types'
import { folderName, folderOf, projectGroupOf, type SessionEntry } from './facets'
import { inWorkspace, workspacesOf } from './workspaces'

/** The last group of the list by project, and the chips' pseudo project (as the hub keeps it in a group). */
export const OTHER_PLACE = 'Other'
export const OTHER = ':other'

export interface Belonging {
  kind: 'project' | 'folder' | 'other'
  /** The project; the folder as `folderOf` shows it (`~/notes`); or `OTHER_PLACE`. */
  name: string
}

const TEMP = /^\/(?:private\/)?(?:tmp|var\/folders)(?:\/|$)/
const OTHER_ONE: Belonging = { kind: 'other', name: OTHER_PLACE }

/** Whether a folder can hold no project of its own: home, `/`, a temp folder, or none. */
function noPlace(session: Session): boolean {
  const folder = folderOf(session)
  return !folder || folder === '~' || folder === '/' || TEMP.test(session.cwd ?? '')
}

/** The rule, for a session among sessions whose workspaces are `workspaces` (`workspacesOf` all of them). */
export function belongsOf(session: Session, workspaces: ReadonlySet<string>): Belonging {
  const project = projectGroupOf(session)
  if (project) return { kind: 'project', name: project }
  if (noPlace(session) || inWorkspace(session, workspaces)) return OTHER_ONE
  return { kind: 'folder', name: folderOf(session)! }
}

/** Where each of these sessions belongs, worked out among them all. */
export type Belongings = (entry: SessionEntry) => Belonging

/** `belongsOf` over these sessions (all the known ones): one lookup per list, each session worked out once. */
export function belongingsOf(entries: SessionEntry[]): Belongings {
  let found = belongingsCache.get(entries)
  if (!found) {
    const workspaces = workspacesOf(entries)
    const each = new WeakMap<Session, Belonging>()
    found = ({ session }) => {
      let place = each.get(session)
      if (!place) each.set(session, (place = belongsOf(session, workspaces)))
      return place
    }
    belongingsCache.set(entries, found)
  }
  return found
}
const belongingsCache = new WeakMap<SessionEntry[], Belongings>()

/** A place as the chips name it (and the hub keeps it in a group): a project by its name, a folder by its
 *  last part (as the list names its group, the same folder on several machines one), Other as `OTHER`. */
export function chipKeyOf(place: Belonging): string {
  if (place.kind === 'project') return place.name
  return place.kind === 'folder' ? folderName(place.name) : OTHER
}
