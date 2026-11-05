/** Which sessions the list shows for a query: its view, scope, chip and search text. */
import { inChip } from './chip-groups'
import { folderOf, placeOf, statusOf, type SessionEntry } from './facets'
import { worktreeOf } from './places'
import { accountLabel, agentLabel, deviceLabel, folderLabel, placeIn, sourceLabel, type SessionQuery } from './query'
import { inWorkspace, isWorkspace, workspaceOfLoose, workspacesOf } from './workspaces'

function matchesText(entry: SessionEntry, q: string): boolean {
  const { session } = entry
  const haystack = [
    session.name,
    folderLabel(entry),
    deviceLabel(entry),
    agentLabel(entry),
    sourceLabel(entry),
    session.account,
    session.summary?.detail,
    session.summary?.recent,
  ]
  return haystack.some((text) => text?.toLowerCase().includes(q))
}

export function filterEntries(entries: SessionEntry[], query: SessionQuery): SessionEntry[] {
  const q = query.q?.trim().toLowerCase()
  const workspaces = query.chip || query.folder ? workspacesOf(entries) : new Set<string>()
  return entries.filter((entry) => {
    const status = statusOf(entry.session)
    if (placeOf(entry.session) !== placeIn(query.view)) return false
    if (placeIn(query.view) === 'listed' && query.view !== 'all' && status !== query.view) return false
    if (query.device && deviceLabel(entry) !== query.device) return false
    if (query.folder && !inFolder(entry, query.folder, workspaces)) return false
    if (query.agent && agentLabel(entry) !== query.agent) return false
    if (query.source && sourceLabel(entry) !== query.source) return false
    if (query.account && accountLabel(entry) !== query.account) return false
    if (query.chip && !inChip(entry, query.chip, workspaces)) return false
    return !q || matchesText(entry, q)
  })
}

/** Whether a session is listed in a folder row of the sidebar: its place, its worktree, or (a workspace,
 *  `workspaces.ts`) anything it holds, its loose sessions in its "Other" row. */
function inFolder(entry: SessionEntry, folder: string, workspaces: Set<string>): boolean {
  const loose = workspaceOfLoose(folder)
  if (loose) return folderLabel(entry) === loose && inWorkspace(entry, workspaces)
  if (folderLabel(entry) === folder || worktreeOf(entry.session)?.label === folder) return true
  if (!isWorkspace(workspaces, deviceLabel(entry), folder)) return false
  const at = folderOf({ ...entry.session, cwd: entry.session.git?.repo ?? entry.session.project_anchor ?? entry.session.cwd })
  return Boolean(at?.startsWith(`${folder}/`))
}
