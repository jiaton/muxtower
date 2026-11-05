/**
 * Workspaces: a folder outside git that holds repositories other sessions use (~/projects, holding
 * ~/projects/muxtower and ~/projects/ha) is no project, only where projects sit. A session right in it,
 * with no project set, belongs to none: Other in the chip groups, and an "Other" row under the folder in
 * the sidebar, whose own row then only holds (and counts) what lies under it. A folder holding no
 * repository (~/notes) stays a project of its own.
 */
import type { Session } from '@/lib/api/types'
import { NO_ENVIRONMENT, deviceOf, folderOf, type SessionEntry } from './facets'

const deviceLabel = (entry: SessionEntry) => deviceOf(entry.session) ?? NO_ENVIRONMENT

/** The label of a workspace's loose sessions in the sidebar and the URL (`folder=~/projects/:other`). */
export const LOOSE = '/:other'
export const looseIn = (folder: string) => `${folder}${LOOSE}`
export const workspaceOfLoose = (label: string) => (label.endsWith(LOOSE) ? label.slice(0, -LOOSE.length) : null)

const key = (device: string, folder: string) => `${device}\u0000${folder}`
const repoOf = (session: Session) => (session.git ? folderOf({ ...session, cwd: session.git.repo }) : null)

/** Whether a session sits right in its folder with nothing else to place it: no git, no project set. */
const loose = (session: Session) => !session.git && session.project_source !== 'set'

/** The workspaces among the folders sessions sit loose in, per device. */
export function workspacesOf(entries: SessionEntry[]): Set<string> {
  const repos = new Map<string, string[]>()
  for (const entry of entries) {
    const repo = repoOf(entry.session)
    if (repo) repos.set(deviceLabel(entry), [...(repos.get(deviceLabel(entry)) ?? []), repo])
  }
  const found = new Set<string>()
  for (const entry of entries) {
    const folder = folderOf(entry.session)
    if (!folder || !loose(entry.session)) continue
    const inside = (repos.get(deviceLabel(entry)) ?? []).some((r) => r.startsWith(folder === '/' ? '/' : `${folder}/`))
    if (inside) found.add(key(deviceLabel(entry), folder))
  }
  return found
}

/** Whether a device's folder is a workspace. */
export const isWorkspace = (workspaces: Set<string>, device: string, folder: string) => workspaces.has(key(device, folder))

/** Whether a session sits loose in a workspace. */
export function inWorkspace(entry: SessionEntry, workspaces: Set<string>): boolean {
  const folder = folderOf(entry.session)
  return Boolean(folder && loose(entry.session) && workspaces.has(key(deviceLabel(entry), folder)))
}
