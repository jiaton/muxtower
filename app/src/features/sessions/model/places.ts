import type { Session } from '@/lib/api/types'
import { folderOf } from './facets'

/**
 * Where a session is listed under its device, one place each, in this order: its project as the daemon
 * keeps it (set by an agent or the owner, or worked out once from git: the one `my_team` says), unless that
 * is only its folder's name; else its repository (as the daemon read it on the session's machine:
 * `session.git`), its main folder holding every worktree and subfolder of it; else its folder, in the
 * folder tree. By the folder it started in (`cwd`), never where its agent went since (`working_dir`).
 */
export type PlaceKind = 'project' | 'repository' | 'worktree' | 'folder'

/** Its project, when that is what places it (not a folder's name, which the folder tree says better). */
export const projectOf = (session: Session): string | null =>
  session.project && session.project_source !== 'folder' ? session.project : null

/** What kind of place `homeOf` is. */
export const homeKind = (session: Session): PlaceKind => (projectOf(session) ? 'project' : session.git ? 'repository' : 'folder')

export function homeOf(session: Session): string | null {
  const project = projectOf(session)
  if (project) return project
  if (session.git) return folderOf({ ...session, cwd: session.git.repo })
  return folderOf(session)
}

export interface Worktree {
  /** Its folder, as `folderOf` shows it: its key in the lists and the URL. */
  label: string
  /** The repository's place (`homeOf`), which it is listed under. */
  under: string
  /** What it is called there: its branch, else its folder's name. */
  name: string
  /** Its folder in full, for a tooltip. */
  path: string
}

/** The worktree a session runs in, when that is not its repository's main one: under its project when git
 *  gave it one, under its repository otherwise; not when someone set its project (that is its place). */
export function worktreeOf(session: Session): Worktree | null {
  const git = session.git
  if (session.project_source === 'set' || !git || git.worktree === git.repo) return null
  const label = folderOf({ ...session, cwd: git.worktree }) ?? git.worktree
  const under = projectOf(session) ?? folderOf({ ...session, cwd: git.repo }) ?? git.repo
  return { label, under, name: git.branch ?? label.split('/').pop() ?? label, path: git.worktree }
}

/** Its project as said beside its name: as `my_team` says it, marked when muxtower worked it out. */
export const projectLabel = (session: Session): string | null =>
  session.project ? `${session.project}${session.project_auto ? ' (auto)' : ''}` : null

/** Where its agent works now, when deeper than where it started (and is listed): said, never moving it. */
export const workingIn = (session: Session): string | null =>
  session.working_dir
    ? `working in ${folderOf({ ...session, cwd: session.working_dir })
        ?.split('/')
        .pop()}`
    : null

/** Where its project sits in the device's folder tree (`session.project_anchor`, as `folderOf` shows a
 *  folder), when it is listed by its project: the project is nested there like a repository. */
export const anchorOf = (session: Session): string | undefined =>
  projectOf(session) && session.project_anchor ? (folderOf({ ...session, cwd: session.project_anchor }) ?? undefined) : undefined
