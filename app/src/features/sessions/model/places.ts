import type { Session } from '@/lib/api/types'
import { folderOf } from './facets'

/**
 * Where a session is listed under its device, one place each, in this order: the project an agent or the
 * owner put it in; else its repository (as the daemon read it on the session's machine: `session.git`),
 * its main folder holding every worktree and subfolder of it; else its folder, in the folder tree.
 */
export type PlaceKind = 'project' | 'repository' | 'worktree' | 'folder'

/** What kind of place `homeOf` is. */
export const homeKind = (session: Session): PlaceKind => (session.project ? 'project' : session.git ? 'repository' : 'folder')

export function homeOf(session: Session): string | null {
  if (session.project) return session.project
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

/** The worktree a session runs in, when that is not its repository's main one (and no project says). */
export function worktreeOf(session: Session): Worktree | null {
  const git = session.git
  if (session.project || !git || git.worktree === git.repo) return null
  const label = folderOf({ ...session, cwd: git.worktree }) ?? git.worktree
  const under = folderOf({ ...session, cwd: git.repo }) ?? git.repo
  return { label, under, name: git.branch ?? label.split('/').pop() ?? label, path: git.worktree }
}
