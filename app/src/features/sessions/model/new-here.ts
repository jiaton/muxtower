import type { Session } from '@/lib/api/types'
import type { SessionEntry } from './facets'

/** Where a new session starts, given in advance: the daemon, the computer joined to it (null: the
 *  daemon's own), the folder (empty: the machine's default) and, when it joins one, the team project. */
export interface NewSessionPreset {
  daemonId: string
  node: string | null
  cwd: string
  project?: string
}

/** The computer a session runs on, as the new-session dialog names it: a node's name, or null for the
 *  daemon's own machine (a node's session ids carry its name: `node~id`). */
export const nodeOf = (session: Session) => (session.id.includes('~') ? (session.machine ?? null) : null)

/** The folder a session runs in, as a place to start another: its worktree or folder as it is. */
const folderOfSession = (s: Session) => s.git?.worktree ?? s.cwd ?? ''

/** "New session here", on a session: its machine, its folder, and its team project if it is in one. */
export function presetForSession(daemonId: string, session: Session): NewSessionPreset {
  return {
    daemonId,
    node: nodeOf(session),
    cwd: folderOfSession(session),
    ...(session.project ? { project: session.project } : {}),
  }
}

/** A new session in a listed folder: the machine of the sessions it holds, and the folder they share (a
 *  worktree's path, else the repository's main folder, else the folder itself). */
export function presetForFolder(entries: SessionEntry[], path?: string): NewSessionPreset | null {
  const first = entries[0]
  if (!first) return null
  const s = first.session
  return { daemonId: first.daemon.id, node: nodeOf(s), cwd: path ?? s.git?.repo ?? s.project_anchor ?? s.cwd ?? '' }
}

/** A new session on a listed device: its machine, in the machine's default folder. */
export function presetForDevice(entries: SessionEntry[]): NewSessionPreset | null {
  const first = entries[0]
  return first ? { daemonId: first.daemon.id, node: nodeOf(first.session), cwd: '' } : null
}
