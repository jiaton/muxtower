/**
 * The ways a session is classified: what it needs (status), where it runs (device), what it works on
 * (folder), which agent it is, how it was started (source) and which account it runs as. Pure functions over the API's Session, so every list,
 * filter and count agrees.
 */
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'

/** A session together with the daemon that reported it (ids are unique per daemon only). */
export interface SessionEntry {
  key: string
  daemon: Daemon
  session: Session
}

export const entryKey = (daemonId: string, sessionId: string) => `${daemonId}/${sessionId}`

// --- status -------------------------------------------------------------------------------------

/** What a session wants from the owner, most pressing first: it is blocked on them; it failed; it
 *  finished and they have not looked yet (what to pick up next); it is working; nothing. */
export type Status = 'needs' | 'error' | 'unread' | 'working' | 'idle'

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'needs', label: 'Needs you' },
  { id: 'error', label: 'Errors' },
  { id: 'unread', label: 'Finished, unread' },
  { id: 'working', label: 'Working' },
  { id: 'idle', label: 'Idle' },
]

export function statusOf(session: Session): Status {
  if (session.needs_attention) return 'needs'
  if (session.state === 'error') return 'error'
  if (session.state === 'busy') return 'working'
  return session.unread ? 'unread' : 'idle'
}

/** Where a session is listed: with the others, or set aside under Hidden or Archived (each only there). */
export type Place = 'listed' | 'hidden' | 'archived' | 'interrupted'

export const placeOf = (session: Session): Place =>
  session.interrupted_at ? 'interrupted' : session.archived_at ? 'archived' : session.hidden ? 'hidden' : 'listed'

// --- device -------------------------------------------------------------------------------------

/** Sessions whose source names no machine (the Claude desktop app's, for one) and no folder that tells
 *  one: said as it is, for the owner to place them (`capabilities.place`). */
export const NO_ENVIRONMENT = 'No environment'

/** The kind of machine a path belongs to, for sessions no daemon runs: the best name we have. */
function platformOf(cwd: string | undefined): string | null {
  if (!cwd) return null
  if (cwd.startsWith('/Users/')) return 'Mac'
  if (/^[A-Za-z]:[\\/]/.test(cwd)) return 'Windows'
  return cwd.startsWith('/') ? 'Linux' : null
}

/** The machine a session runs on: as its daemon names it, else the kind of machine its folder is on;
 *  null when neither is known. */
export const deviceOf = (session: Session): string | null => session.machine || platformOf(session.cwd)

// --- folder -------------------------------------------------------------------------------------

export const UNKNOWN_FOLDER = 'Unknown folder'

/** The working directory, with the home directory shown as ~. Null when the source does not say. */
export function folderOf(session: Session): string | null {
  const cwd = session.cwd?.replace(/\/+$/, '')
  if (!cwd) return null
  return cwd.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)|^\/root(?=\/|$)/, '~') || '/'
}

/** The last part of the folder: what a row has room for. */
export const folderName = (folder: string) => folder.split('/').filter(Boolean).pop() ?? folder

/** Short names for a set of folders: the last part, or as many trailing parts as tell them apart. */
export function shortFolderNames(folders: string[]): Map<string, string> {
  const parts = new Map(folders.map((f) => [f, f.split('/').filter(Boolean)]))
  const short = (f: string, n: number) => parts.get(f)!.slice(-n).join('/') || f
  const names = new Map<string, string>()
  for (const folder of folders) {
    let n = 1
    while (n < parts.get(folder)!.length && folders.some((o) => o !== folder && short(o, n) === short(folder, n))) n += 1
    names.set(folder, short(folder, n))
  }
  return names
}

// --- project ------------------------------------------------------------------------------------

/** The last group of the list by project: sessions in a home folder, a temp folder, `/`, or none. */
export const OTHER_PLACE = 'Other'

/** What a session works on, the same on every device: its team project (`session.project`, set by an
 *  agent or the owner, or worked out from git), else its git repository (its remote's owner/repo, else
 *  its main folder's name: a worktree is its repository's); null when it has neither (`placeGroupOf`). A
 *  project worked out only from a folder's name says no more than the folder: none. */
export function projectGroupOf(session: Session): string | null {
  if (session.project && session.project_source !== 'folder') return session.project
  const git = session.git
  if (git) return git.remote || folderName(git.repo)
  return null
}

const TEMP = /^\/(?:private\/)?(?:tmp|var\/folders)(?:\/|$)/

/** Where a session is grouped when listed by project: its project; else its folder (`folderOf`, kind
 *  "folder"); else, in a home, temp or root folder or none, Other. */
export function placeGroupOf(session: Session): { kind: 'project' | 'folder' | 'other'; name: string } {
  const project = projectGroupOf(session)
  if (project) return { kind: 'project', name: project }
  const folder = folderOf(session)
  if (!folder || folder === '~' || folder === '/' || TEMP.test(session.cwd ?? '')) return { kind: 'other', name: OTHER_PLACE }
  return { kind: 'folder', name: folder }
}

// --- role -------------------------------------------------------------------------------------

/** Where a role's name ends and what it is for begins: a dash with spaces round it ("PM — 只读…",
 *  "worker - …"), a colon ("g2 worker: glasses"), an opening bracket ("PM（只读）"). A dash inside a
 *  word ("g2-worker") is part of the name. */
const ROLE_END = /\s*[—–]\s*|\s+-\s+|\s*[:：（(]/

/** How long a role is shown where it shares a line (a row's meta line, a header's subtitle). */
export const ROLE_SHOWN = 60

/** A role as a line shows it: whole up to `ROLE_SHOWN` characters, else cut at a word with an ellipsis (the
 *  Team dialog shows it all). Null for no role. */
export function roleShown(session: Session): string | null {
  const role = session.team_role?.trim()
  if (!role) return null
  if (role.length <= ROLE_SHOWN) return role
  const cut = role.slice(0, ROLE_SHOWN - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > ROLE_SHOWN / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The leading name of a role as written ("PM — 只读：…" → "PM"); null for no role. */
export function roleNameOf(session: Session): string | null {
  const name = session.team_role?.split(ROLE_END)[0]?.trim()
  return name || null
}

/** A role as it is filtered and grouped by: its leading name without case ("pm"), the same for every
 *  project's PM; null for no role. */
export const roleKeyOf = (session: Session): string | null => roleNameOf(session)?.toLowerCase() ?? null

const capitals = (text: string) => [...text].filter((c) => c !== c.toLowerCase()).length

/** How each role key is shown: as its sessions write it most; a tie to the more capitalised ("PM" over "pm"). */
export function roleLabels(sessions: Session[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const session of sessions) {
    const name = roleNameOf(session)
    if (!name) continue
    const key = name.toLowerCase()
    const ways = counts.get(key) ?? new Map<string, number>()
    ways.set(name, (ways.get(name) ?? 0) + 1)
    counts.set(key, ways)
  }
  return new Map(
    [...counts].map(([key, ways]) => [
      key,
      [...ways].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && capitals(b[0]) > capitals(a[0])) ? b : a))[0],
    ]),
  )
}

// --- source -------------------------------------------------------------------------------------

export const SOURCES = ['muxtower', 'tmux', 'Headless', 'CLI', 'Desktop app', 'IDE', 'Mobile app', 'Web', 'SDK'] as const

const ORIGINS: [RegExp, string][] = [
  [/desktop/, 'Desktop app'],
  [/android|ios|mobile/, 'Mobile app'],
  [/vscode|jetbrains|ide\b/, 'IDE'],
  [/sdk/, 'SDK'],
  [/web|claude_ai/, 'Web'],
  [/cli/, 'CLI'],
]

/** How the session was started: by muxtower (in tmux, or headless: no terminal), found in tmux, or (Remote
 *  Control) from which app. A tmux session that also runs Remote Control counts as tmux: that is where
 *  you find it. */
export function sourceOf(session: Session): string {
  if (session.source === 'launched') return 'muxtower'
  if (session.source === 'adopted') return 'tmux'
  if (session.source === 'codex') return 'Headless'
  const origin = session.origin?.toLowerCase()
  const match = origin ? ORIGINS.find(([pattern]) => pattern.test(origin)) : undefined
  return match?.[1] ?? origin ?? 'Remote Control'
}

// --- agent --------------------------------------------------------------------------------------

/** The agents muxtower ships runtimes for, by runtime name, in the order they are listed. A runtime the
 *  owner defined goes by its own name, after these. */
export const AGENTS: Record<string, string> = { 'claude-code': 'Claude Code', codex: 'Codex', opencode: 'opencode' }
const AGENT_ORDER = Object.values(AGENTS)

/** The agent a runtime runs, as people call it. */
export const agentName = (runtime: string) => AGENTS[runtime] ?? runtime

/** Which agent the session is (Claude Code, Codex…): what it can do and how it asks follows from it. */
export const agentOf = (session: Session): string => agentName(session.runtime)

/** Known agents in their order, then the rest by name. */
export const compareAgents = (a: string, b: string) =>
  (AGENT_ORDER.indexOf(a) + 1 || 99) - (AGENT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b)

/** Whether agents are worth showing on every row: only when the sessions are not all the same agent. */
export const agentsDiffer = (sessions: Session[]) => new Set(sessions.map((s) => s.runtime)).size > 1

// --- account ------------------------------------------------------------------------------------

export const UNKNOWN_ACCOUNT = 'Unknown account'

/** The account its agent runs as (an email, or "API key"), as its daemon knows it. */
export const accountOf = (session: Session): string => session.account ?? UNKNOWN_ACCOUNT

/** Whether accounts are worth showing at all: only when the sessions run as more than one. */
export const accountsDiffer = (sessions: Session[]) => new Set(sessions.map((s) => s.account).filter(Boolean)).size > 1

export const isAssistant = (session: Session) => session.role === 'concierge'

/** Seen and answered: nothing about it waits for the owner (its notifications can go). */
export const isSettled = (session: Session) => !session.unread && !session.needs_attention
