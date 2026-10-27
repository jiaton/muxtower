/**
 * The ways a session is classified: what it needs (status), where it runs (device), what it works on
 * (folder), how it was started (source) and which account it runs as. Pure functions over the API's Session, so every list,
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
export type Place = 'listed' | 'hidden' | 'archived'

export const placeOf = (session: Session): Place => (session.archived_at ? 'archived' : session.hidden ? 'hidden' : 'listed')

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

// --- account ------------------------------------------------------------------------------------

export const UNKNOWN_ACCOUNT = 'Unknown account'

/** The account its agent runs as (an email, or "API key"), as its daemon knows it. */
export const accountOf = (session: Session): string => session.account ?? UNKNOWN_ACCOUNT

/** Whether accounts are worth showing at all: only when the sessions run as more than one. */
export const accountsDiffer = (sessions: Session[]) => new Set(sessions.map((s) => s.account).filter(Boolean)).size > 1

export const isAssistant = (session: Session) => session.role === 'concierge'
