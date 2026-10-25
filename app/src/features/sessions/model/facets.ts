/**
 * The ways a session is classified: what it needs (status), where it runs (device), what it works on
 * (folder) and how it was started (source). Pure functions over the API's Session, so every list,
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

export type Status = 'needs' | 'error' | 'working' | 'idle'

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'needs', label: 'Needs you' },
  { id: 'error', label: 'Errors' },
  { id: 'working', label: 'Working' },
  { id: 'idle', label: 'Idle' },
]

export function statusOf(session: Session): Status {
  if (session.needs_attention) return 'needs'
  if (session.state === 'error') return 'error'
  if (session.state === 'busy') return 'working'
  return 'idle'
}

// --- device -------------------------------------------------------------------------------------

/** Remote Control sessions that run on none of your daemons' machines, in no folder we know. */
export const OTHER_DEVICES = 'Other devices'

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

export const SOURCES = ['muxtower', 'tmux', 'CLI', 'Desktop app', 'Mobile app', 'Web', 'SDK'] as const

const ORIGINS: [RegExp, string][] = [
  [/desktop/, 'Desktop app'],
  [/android|ios|mobile/, 'Mobile app'],
  [/sdk/, 'SDK'],
  [/web|claude_ai/, 'Web'],
  [/cli/, 'CLI'],
]

/** How the session was started: by muxtower, found in tmux, or (Remote Control) from which app. A
 *  tmux session that also runs Remote Control counts as tmux: that is where you find it. */
export function sourceOf(session: Session): string {
  if (session.source === 'launched') return 'muxtower'
  if (session.source === 'adopted') return 'tmux'
  const origin = session.origin?.toLowerCase()
  const match = origin ? ORIGINS.find(([pattern]) => pattern.test(origin)) : undefined
  return match?.[1] ?? origin ?? 'Remote Control'
}

export const isAssistant = (session: Session) => session.role === 'concierge'
