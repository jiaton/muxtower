import type { Session } from '@/lib/api/types'
import { projectOf, type SessionEntry } from './facets'

/** Where a new session starts, given in advance: the daemon, the computer joined to it (null: the
 *  daemon's own), the folder (empty: the machine's default) and, when it joins one, the team project. */
export interface NewSessionPreset {
  daemonId: string
  node: string | null
  cwd: string
  project?: string
  /** The folders to pick from when there is more than one (`cwd` is the first): where its agent works now,
   *  then where it started. */
  places?: NewSessionPlace[]
}

export interface NewSessionPlace {
  label: 'Where it works now' | 'Where it started'
  cwd: string
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

/** "New session here", on a session: its machine, its folder, and its project (set, or from git), which the
 *  new one is set to; none for one whose project is only its folder's name (no project). Null where its
 *  computer cannot start one. Its folder is where its agent works now (`working_dir`, a folder inside the one
 *  it started in), offered with the one it started in; else that one alone. */
export function presetForSession(daemonId: string, session: Session, nodes: readonly string[]): NewSessionPreset | null {
  const node = computerOf(session, nodes)
  if (node === undefined) return null
  const project = projectOf(session)
  const started = folderOfSession(session)
  const now = session.working_dir?.replace(/\/+$/, '')
  const places: NewSessionPlace[] | null =
    now && now !== started.replace(/\/+$/, '')
      ? [
          { label: 'Where it works now', cwd: now },
          { label: 'Where it started', cwd: started },
        ]
      : null
  return { daemonId, node, cwd: places ? now! : started, ...(project ? { project } : {}), ...(places ? { places } : {}) }
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

/** A new session in a project (or a folder, `team` false) of the list (grouped by project, across devices): on the computer most of
 *  its sessions that can start one run on, in its repository's main folder there (else its anchor, else
 *  the folder those sessions share most), in that team when the project is one. */
export function presetForProject(entries: SessionEntry[], nodes: readonly string[], project: string, team = true): NewSessionPreset | null {
  const able = entries.flatMap((entry) => {
    const node = computerOf(entry.session, nodes)
    return node === undefined ? [] : [{ entry, node, where: `${entry.daemon.id} ${node ?? ''}` }]
  })
  if (!able.length) return null
  const counts = new Map<string, number>()
  for (const a of able) counts.set(a.where, (counts.get(a.where) ?? 0) + 1)
  const where = [...counts].sort((x, y) => y[1] - x[1])[0]![0]
  const there = able.filter((a) => a.where === where)
  const folders = new Map<string, number>()
  for (const { entry } of there) {
    const s = entry.session
    const folder = s.git?.repo ?? s.project_anchor ?? s.cwd ?? ''
    folders.set(folder, (folders.get(folder) ?? 0) + 1)
  }
  const cwd = [...folders].sort((x, y) => y[1] - x[1])[0]?.[0] ?? ''
  const inTeam = team && entries.some((e) => e.session.project === project)
  return { daemonId: there[0]!.entry.daemon.id, node: there[0]!.node, cwd, ...(inTeam ? { project } : {}) }
}
