/**
 * One way to match sessions to typed text, for the list's search and the command palette (Cmd+K): the
 * text's terms (`role:pm`, `project:acme/web`, quoted when they hold a space) narrow by facet, the rest is
 * matched against what a session is called and where and what it is. A score orders the palette: a field
 * starting with the text beats one with a word starting with it, which beats one only containing it; the
 * name counts most; a session waiting on the owner, or busy just now, a little more.
 */
import { belongingsOf, type Belongings } from './belongs'
import { agentOf, deviceOf, folderOf, roleKeyOf, sourceOf, statusOf, type SessionEntry } from './facets'

const TERM = /(?:^|\s)(role|project):(?:"([^"]+)"|(\S+))/gi

export interface SearchTerms {
  /** Role keys (`roleKeyOf`); several: any of them. */
  roles: string[]
  /** Projects as their group is named (where a session belongs, `belongs.ts`), without case; several: any. */
  projects: string[]
  /** The rest, lower case, matched as text. */
  text: string
}

/** Typed text split into its `role:` and `project:` terms and the rest. */
export function searchTerms(q: string): SearchTerms {
  const roles: string[] = []
  const projects: string[] = []
  for (const m of q.matchAll(TERM)) {
    const value = (m[2] ?? m[3]).trim().toLowerCase()
    if (value) (m[1].toLowerCase() === 'role' ? roles : projects).push(value)
  }
  return { roles, projects, text: q.replace(TERM, ' ').trim().toLowerCase() }
}

/** What a session's text is matched against, the most telling first, each with its weight. */
function fields(entry: SessionEntry, places: Belongings): [string | null | undefined, number][] {
  const { session } = entry
  return [
    [session.name, 3],
    [session.team_role, 2],
    [places(entry).name, 2],
    [session.project, 2],
    [folderOf(session), 1],
    [deviceOf(session), 1],
    [agentOf(session), 1],
    [sourceOf(session), 0.5],
    [session.account, 0.5],
    [session.summary?.detail, 0.5],
    [session.summary?.recent, 0.5],
    [session.last_message, 0.5],
  ]
}

/** Whether a session has what the terms narrow to (its role, its project), placed by `places` (every known
 *  session's, `belongingsOf`). */
export function inTerms(entry: SessionEntry, terms: SearchTerms, places: Belongings): boolean {
  if (terms.roles.length && !terms.roles.includes(roleKeyOf(entry.session) ?? '')) return false
  const project = places(entry).name.toLowerCase()
  return !terms.projects.length || terms.projects.some((p) => project === p || project.endsWith(`/${p}`))
}

const WORD = /[\s/._:·—–-]+/

/** How well a session matches the text part of the terms: 0, none. */
export function textScore(entry: SessionEntry, text: string, places: Belongings): number {
  if (!text) return 1
  let best = 0
  for (const [value, weight] of fields(entry, places)) {
    const v = value?.toLowerCase()
    if (!v) continue
    const how = v.startsWith(text) ? 3 : v.split(WORD).some((w) => w.startsWith(text)) ? 2 : v.includes(text) ? 1 : 0
    best = Math.max(best, how * weight)
  }
  return best
}

/** The palette's order: how well, then waiting on the owner, then how recently it moved. */
export function score(entry: SessionEntry, terms: SearchTerms, places: Belongings, now = Date.now()): number {
  if (!inTerms(entry, terms, places)) return 0
  const text = textScore(entry, terms.text, places)
  if (!text) return 0
  const status = statusOf(entry.session)
  const age = (now - (Date.parse(entry.session.updated_at) || 0)) / 3_600_000
  return text * 10 + (status === 'needs' ? 4 : status === 'error' ? 2 : 0) + (age < 1 ? 2 : age < 24 ? 1 : 0)
}

/** Sessions matching `q`, best first. */
export function rank(entries: SessionEntry[], q: string, now = Date.now()): SessionEntry[] {
  const terms = searchTerms(q)
  const places = belongingsOf(entries)
  return entries
    .map((entry) => ({ entry, score: score(entry, terms, places, now) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.entry.session.updated_at) - Date.parse(a.entry.session.updated_at))
    .map((x) => x.entry)
}
