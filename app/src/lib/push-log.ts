/**
 * What the service worker did with each push and notification (`sw.ts`), kept for the daemon to read: why
 * a notification of a session already read was or was not taken away on a device. Tags, ids, counts and
 * times only, never a notification's title or body. Kept in IndexedDB (the newest RING_SIZE), posted to the
 * daemon by the app when a page of it is open (`features/push/api/report-push-log.ts`, diagnostics source
 * `push-clear`), and shown in Daemons › Diagnostics.
 */
import { idbRing } from './idb-ring'
import type { CloseOutcome } from './sw-notifications'

export const RING_SIZE = 200
const MAX_TAGS = 30 // per list: a device shows a few notifications per daemon

/** `show`: a push shown (it may also have closed settled ones); `clear`: a push that only closes;
 *  `tap`: a notification tapped; `dismiss`: one swiped away (or closed by the system). */
export type PushLogEvent = 'show' | 'clear' | 'tap' | 'dismiss'

export interface PushLogRecord {
  at: number // epoch ms
  event: PushLogEvent
  /** The push's kind (`attention`, `done`, `clear`…), for a push. */
  kind: string | null
  /** The push's `client_ref`: the app's id of the daemon it came from, as the daemon has it. */
  ref: string | null
  /** The registration it came to: the daemon id in its scope (`push/<id>/`), and the app's host. */
  scope: string | null
  origin: string | null
  /** The app version this worker was built with. */
  version: string
  /** The session a shown push is for. */
  session: string | null
  /** The tag shown, tapped or dismissed. */
  tag: string | null
  /** What closing found and did (`closeSessions`); empty for a tap or a dismiss. */
  asked: string[]
  present: { tag: string; at: number | null }[]
  closed: string[]
  held: string[]
  /** Whether this close had to leave one on screen (a `clear` push). */
  keepOne: boolean
}

/** A tag as it may be kept: a trigger's carries the trigger's name, which is the owner's words. */
export function safeTag(tag: string): string {
  const parts = tag.split(':')
  return parts[1] === 'trigger' ? `${parts[0]}:trigger` : tag
}

/** The daemon id a push registration's scope names (`<base>push/<id>/`), if it is one. */
export function scopeDaemon(scope: string): string | null {
  const match = /\/push\/([^/]+)\/$/.exec(new URL(scope).pathname)
  return match ? decodeURIComponent(match[1]!) : null
}

const tags = (list: readonly string[]) => list.slice(0, MAX_TAGS).map(safeTag)

/** A record of a push, or of a tap or dismiss (`outcome` absent). */
export function pushRecord(
  event: PushLogEvent,
  fields: { kind?: string | null; ref?: string | null; session?: string | null; tag?: string | null; scope: string; version: string },
  outcome?: CloseOutcome,
  keepOne = false,
  now = Date.now(),
): PushLogRecord {
  const url = new URL(fields.scope)
  return {
    at: now,
    event,
    kind: fields.kind ?? null,
    ref: fields.ref ?? null,
    scope: scopeDaemon(fields.scope),
    origin: url.host,
    version: fields.version,
    session: fields.session ?? null,
    tag: fields.tag ? safeTag(fields.tag) : null,
    asked: tags(outcome?.asked ?? []),
    present: (outcome?.present ?? []).slice(0, MAX_TAGS).map((n) => ({ tag: safeTag(n.tag), at: n.at })),
    closed: tags(outcome?.closed ?? []),
    held: tags(outcome?.held ?? []),
    keepOne,
  }
}

const ring = idbRing<PushLogRecord>('muxtower-push-log', RING_SIZE)

/** Keeps a record; never throws. */
export const logPush = (record: PushLogRecord): Promise<void> => ring.add(record)

/** Every record kept, oldest first, with its key (keys only grow). */
export const readPushLog = () => ring.all()
