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

/** Remote Control sessions that run on none of your daemons' machines. */
export const OTHER_DEVICES = 'Other devices'

/** The machine a session runs on, as its daemon names it; null when no daemon knows. */
export const deviceOf = (session: Session): string | null => session.machine || null

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

// --- source -------------------------------------------------------------------------------------

const ORIGINS: [RegExp, string][] = [
  [/desktop/, 'Desktop app'],
  [/android|ios|mobile/, 'Mobile app'],
  [/sdk/, 'SDK'],
  [/web|claude_ai/, 'Web'],
  [/cli/, 'CLI'],
]

/** How the session was started: by muxtower, found in tmux, or (Remote Control) from which app. */
export function sourceOf(session: Session): string {
  const origin = session.origin?.toLowerCase()
  const match = origin ? ORIGINS.find(([pattern]) => pattern.test(origin)) : undefined
  if (match) return match[1]
  if (session.source === 'launched') return 'muxtower'
  if (session.source === 'adopted') return 'tmux'
  return origin ?? 'Remote Control'
}

export const isAssistant = (session: Session) => session.role === 'concierge'
