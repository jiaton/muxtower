/**
 * Workspaces: a folder outside git that holds other sessions' projects (~/projects, holding
 * ~/projects/muxtower and ~/projects/ha) is no project, only where projects sit. A session right in it with
 * no project from the hub and no git (one the hub named after the folder has none) belongs to none (`belongs.ts`):
 * Other wherever sessions are placed, and an "Other" row under the folder in the sidebar, whose own row then
 * only holds (and counts) what lies under it. A session started there that the hub gives a project is that
 * project's. A folder holding no project (~/notes) stays a place of its own.
 */
import type { Session } from '@/lib/api/types'
import { NO_ENVIRONMENT, deviceOf, folderOf, projectGroupOf, projectOf, type SessionEntry } from './facets'

const deviceLabel = (session: Session) => deviceOf(session) ?? NO_ENVIRONMENT

/** The label of a workspace's loose sessions in the sidebar and the URL (`folder=~/projects/:other`). */
export const LOOSE = '/:other'
export const looseIn = (folder: string) => `${folder}${LOOSE}`
export const workspaceOfLoose = (label: string) => (label.endsWith(LOOSE) ? label.slice(0, -LOOSE.length) : null)

const key = (device: string, folder: string) => `${device}\u0000${folder}`
/** Where a session's project sits: its repository's main folder, else its project's folder (`project_anchor`). */
function homeOf(session: Session): string | null {
  const home = session.git?.repo ?? (projectOf(session) ? session.project_anchor : null)
  return home ? folderOf({ ...session, cwd: home }) : null
}

/** Whether a session sits right in its folder with nothing else to place it: no project from the hub (one
 *  worked out from the folder's name is none) and no git. A project started in a workspace is that project. */
const loose = (session: Session) => projectGroupOf(session) === null

/** The workspaces among the folders sessions sit loose in, per device. */
export function workspacesOf(entries: SessionEntry[]): ReadonlySet<string> {
  let found = workspacesCache.get(entries)
  if (!found) workspacesCache.set(entries, (found = findWorkspaces(entries)))
  return found
}
/** Per list of entries: every folder row of the sidebar filters by folder, and each asked for these again. */
const workspacesCache = new WeakMap<SessionEntry[], ReadonlySet<string>>()

function findWorkspaces(entries: SessionEntry[]): Set<string> {
  const repos = new Map<string, string[]>()
  for (const entry of entries) {
    const home = homeOf(entry.session)
    const device = deviceLabel(entry.session)
    if (home) repos.set(device, [...(repos.get(device) ?? []), home])
  }
  const found = new Set<string>()
  for (const entry of entries) {
    const folder = folderOf(entry.session)
    if (!folder || !loose(entry.session)) continue
    const inside = (repos.get(deviceLabel(entry.session)) ?? []).some((r) => r.startsWith(folder === '/' ? '/' : `${folder}/`))
    if (inside) found.add(key(deviceLabel(entry.session), folder))
  }
  return found
}

/** Whether a device's folder is a workspace. */
export const isWorkspace = (workspaces: ReadonlySet<string>, device: string, folder: string) => workspaces.has(key(device, folder))

/** Whether a session sits loose in a workspace. */
export function inWorkspace(session: Session, workspaces: ReadonlySet<string>): boolean {
  const folder = folderOf(session)
  return Boolean(folder && loose(session) && workspaces.has(key(deviceLabel(session), folder)))
}
