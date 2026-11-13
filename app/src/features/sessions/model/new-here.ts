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
 *  daemon's own machine; undefined where no session can be started (a cloud session, a computer without
 *  muxtower). The same place the list groups it under (`deviceOf`): a node's session says its node; one
 *  on the daemon's machine says so (`on_host`), as does a terminal it runs itself; a Remote Control session
 *  elsewhere names the computer its process runs on, started there only when that one is a node. */
export function computerOf(session: Session, nodes: readonly string[]): string | null | undefined {
  if (session.node) return session.node
  if (session.on_host || session.source === 'launched' || session.source === 'adopted') return null
  return session.machine && nodes.includes(session.machine) ? session.machine : undefined
}

/** The folder a session runs in, as a place to start another: its worktree or folder as it is. */
const folderOfSession = (s: Session) => s.git?.worktree ?? s.cwd ?? ''

/** "New session here", on a session: its machine, its folder, and its team project if it is in one;
 *  null where its computer cannot start one. */
export function presetForSession(daemonId: string, session: Session, nodes: readonly string[]): NewSessionPreset | null {
  const node = computerOf(session, nodes)
  if (node === undefined) return null
  return { daemonId, node, cwd: folderOfSession(session), ...(session.project ? { project: session.project } : {}) }
}

/** The first of `entries` whose computer can start a session, with that computer. */
function startable(entries: SessionEntry[], nodes: readonly string[]) {
  for (const entry of entries) {
    const node = computerOf(entry.session, nodes)
    if (node !== undefined) return { entry, node }
  }
  return null
}

/** A new session in a listed folder: the machine of the sessions it holds, and the folder they share (a
 *  worktree's path, else the repository's main folder, else the folder itself). */
export function presetForFolder(entries: SessionEntry[], nodes: readonly string[], path?: string): NewSessionPreset | null {
  const found = startable(entries, nodes)
  if (!found) return null
  const s = found.entry.session
  return { daemonId: found.entry.daemon.id, node: found.node, cwd: path ?? s.git?.repo ?? s.project_anchor ?? s.cwd ?? '' }
}

/** A new session on a listed device: its machine, in the machine's default folder. */
export function presetForDevice(entries: SessionEntry[], nodes: readonly string[]): NewSessionPreset | null {
  const found = startable(entries, nodes)
  return found ? { daemonId: found.entry.daemon.id, node: found.node, cwd: '' } : null
}
