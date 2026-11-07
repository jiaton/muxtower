import type { Session } from '@/lib/api/types'

/**
 * Mentioning a session in a message (`@`): what starts one, what it inserts, and what it may point at.
 * The text is `@role@project (id)`, as `send_task` addresses a session (`role@project`), with its id after,
 * which settles any doubt and keeps it apart from Claude Code's own `@file`: no file is named like that,
 * and Claude Code takes it as plain text (checked). Parsing it back (`mentionsIn`) lives here too, for a
 * later "send as task".
 */

/** The query of a mention being typed at `caret`: after an `@` at the start or after whitespace, up to the
 *  caret, with no whitespace in it. Null when the caret is not in one. */
export function mentionAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null // inside a word (an e-mail, a@b)
  const query = before.slice(at + 1)
  if (/\s/.test(query) || query.includes('@')) return null
  return { start: at, query }
}

const MAX_HANDLE = 32

/** What a session is called in a mention: its role, else its name, on one line. A role is free text, often
 *  a title and what it does ("PM — 只读：…", "g2 worker: glasses/ client"): its title is enough, the id in
 *  the mention says which session it is (`send_task` takes the id first). */
export function handleOf(s: Session): string {
  const role = s.team_role?.split(/\s*[—–]\s*|\s+-\s+|[:：]/)[0]?.trim() // a dash (a hyphen only spaced), a colon
  const handle = (role || s.name).replace(/\s+/g, ' ').trim()
  return handle.length > MAX_HANDLE ? `${handle.slice(0, MAX_HANDLE - 1).trimEnd()}…` : handle
}

/** The text a mention of `s` inserts (followed by a space when inserted). */
export function mentionOf(s: Session): string {
  return s.project ? `@${handleOf(s)}@${s.project} (${s.id})` : `@${handleOf(s)} (${s.id})`
}

const MENTION = /@([^@\n]+?)(?:@(\S+))? \(([\w~-]+)\)/g

/** The mentions in a message, in order: what each names and the session id it carries. */
export function mentionsIn(text: string): { handle: string; project: string | null; id: string }[] {
  return [...text.matchAll(MENTION)].map((m) => ({ handle: m[1]!.trim(), project: m[2] ?? null, id: m[3]! }))
}

/** A row of the list: a session, or another project folded to one row (chosen, it opens in place). */
export type Row = { kind: 'session'; session: Session } | { kind: 'project'; project: string; count: number }

const NO_PROJECT = 'no project'
const projectOf = (s: Session) => s.project ?? NO_PROJECT
const mentionable = (s: Session, current: Session) => s.id !== current.id && !s.archived_at && !s.hidden

/** Order within a group: those that need the owner, then the most recently active. */
const byActivity = (a: Session, b: Session) =>
  Number(b.needs_attention) - Number(a.needs_attention) || (b.updated_at ?? '').localeCompare(a.updated_at ?? '')

/**
 * What `@` offers in `current`'s box. With a query: every session it matches, across projects, best first.
 * Without: its own team, then the sessions mentioned lately (`recent`, newest first, ids), then each other
 * project folded to one row, unless `open`. The assistant has no team: the sessions that need the owner
 * come first instead.
 */
export function rowsFor(
  sessions: Session[],
  current: Session,
  query: string,
  recent: string[],
  open: ReadonlySet<string> = new Set(),
): Row[] {
  const pool = sessions.filter((s) => mentionable(s, current))
  if (query) return search(pool, query).map((session) => ({ kind: 'session', session }))
  const assistant = current.role === 'concierge' // the assistant: no team of its own
  const first = assistant
    ? pool.filter((s) => s.needs_attention).sort(byActivity)
    : pool.filter((s) => current.project != null && s.project === current.project).sort(byActivity)
  const shown = new Set(first.map((s) => s.id))
  const lately = recent
    .map((id) => pool.find((s) => s.id === id))
    .filter((s): s is Session => !!s && !shown.has(s.id))
    .slice(0, 3)
  for (const s of lately) shown.add(s.id)
  const rows: Row[] = [...first, ...lately].map((session) => ({ kind: 'session', session }))
  const groups = new Map<string, Session[]>()
  for (const s of pool) {
    if (shown.has(s.id)) continue
    const p = projectOf(s)
    groups.set(p, [...(groups.get(p) ?? []), s])
  }
  for (const [project, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (open.has(project)) rows.push(...members.sort(byActivity).map((session) => ({ kind: 'session' as const, session })))
    else rows.push({ kind: 'project', project, count: members.length })
  }
  return rows
}

/** How well `query` matches `text` (lower is better): a word start, inside, the letters in order; or not. */
function score(text: string, query: string): number | null {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const at = t.indexOf(q)
  if (at === 0 || (at > 0 && /[\s/@._-]/.test(t[at - 1]!))) return 0
  if (at > 0) return 1
  let i = 0
  for (const c of t) if (c === q[i]) i++
  return i === q.length ? 2 : null
}

/** The sessions `query` matches by role, name or project, best first (then the most recently active). */
export function search(sessions: Session[], query: string): Session[] {
  const scored = sessions
    .map((s) => {
      const fields = [s.team_role ?? '', s.name, s.project ?? '']
      const best = Math.min(...fields.map((f) => score(f, query) ?? Infinity))
      return { s, best }
    })
    .filter((x) => x.best !== Infinity)
  return scored.sort((a, b) => a.best - b.best || byActivity(a.s, b.s)).map((x) => x.s)
}

const RECENT_KEY = 'muxtower.mentions.recent'
const RECENT_KEPT = 10

/** The sessions this browser mentioned lately, on `daemonId`, newest first. Nothing when storage is not there. */
export function recentMentions(daemonId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, string[]>
    return Array.isArray(all[daemonId]) ? all[daemonId] : []
  } catch {
    return []
  }
}

export function rememberMention(daemonId: string, sessionId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, string[]>
    const list = [sessionId, ...(all[daemonId] ?? []).filter((id) => id !== sessionId)].slice(0, RECENT_KEPT)
    localStorage.setItem(RECENT_KEY, JSON.stringify({ ...all, [daemonId]: list }))
  } catch {
    // a private window or blocked storage: no recent mentions, nothing else changes
  }
}
