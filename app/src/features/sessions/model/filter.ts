/** Which sessions the list shows for a query: its view, scope, chip and search text. */
import { belongingsOf } from './belongs'
import { inChip } from './chip-groups'
import { folderOf, isAssistant, placeOf, statusOf, type SessionEntry } from './facets'
import { inTerms, searchTerms, textScore } from './match'
import { worktreeOf } from './places'
import { accountLabel, agentLabel, deviceLabel, folderLabel, placeIn, projectLabel, sourceLabel, type SessionQuery } from './query'
import { inWorkspace, isWorkspace, workspaceOfLoose, workspacesOf } from './workspaces'

/** The list's search: the terms of `match.ts` (the palette's too), any session with the text anywhere. */
export { searchTerms } from './match'

export function filterEntries(entries: SessionEntry[], query: SessionQuery): SessionEntry[] {
  const terms = searchTerms(query.q ?? '')
  const places = belongingsOf(entries)
  const workspaces = query.folder ? workspacesOf(entries) : new Set<string>()
  return entries.filter((entry) => {
    const status = statusOf(entry.session)
    if (placeOf(entry.session) !== placeIn(query.view)) return false
    // The assistant keeps its own place at the top of every view of the list (a chip, Unread, a device…), as
    // the one session the owner talks to about all the others; only a search for words is asked to match it.
    if (isAssistant(entry.session) && placeIn(query.view) === 'listed' && !(query.q ?? '').trim()) return true
    if (placeIn(query.view) === 'listed' && query.view !== 'all' && status !== query.view) return false
    if (query.device && deviceLabel(entry) !== query.device) return false
    if (query.folder && !inFolder(entry, query.folder, workspaces)) return false
    if (query.agent && agentLabel(entry) !== query.agent) return false
    if (query.source && sourceLabel(entry) !== query.source) return false
    if (query.account && accountLabel(entry) !== query.account) return false
    if (query.project && projectLabel(entry, places) !== query.project) return false
    if (query.chip && !inChip(entry, query.chip, places)) return false
    return inTerms(entry, terms, places) && textScore(entry, terms.text, places) > 0
  })
}

/** Whether a session is listed in a folder row of the sidebar: its place, its worktree, or (a workspace,
 *  `workspaces.ts`) anything it holds, its loose sessions in its "Other" row. */
function inFolder(entry: SessionEntry, folder: string, workspaces: ReadonlySet<string>): boolean {
  const loose = workspaceOfLoose(folder)
  if (loose) return folderLabel(entry) === loose && inWorkspace(entry.session, workspaces)
  if (folderLabel(entry) === folder || worktreeOf(entry.session)?.label === folder) return true
  if (!isWorkspace(workspaces, deviceLabel(entry), folder)) return false
  const at = folderOf({ ...entry.session, cwd: entry.session.git?.repo ?? entry.session.project_anchor ?? entry.session.cwd })
  return Boolean(at?.startsWith(`${folder}/`))
}
