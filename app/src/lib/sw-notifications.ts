/** How the service worker takes notifications away (`sw.ts`), apart from it so it can be tested. */

/** What the service worker sees of a notification it shows. */
export interface ShownNotification {
  tag: string
  timestamp?: number
  data?: unknown
  close: () => void
}

export interface NotificationRegistration {
  getNotifications: () => Promise<ShownNotification[]>
}

/** A session's notification: one per session of a daemon (`ref`), replaced in place by the next. */
export const sessionTag = (ref: string, sessionId: string) => `${ref}:${sessionId}`

/** The tag a push is shown under: its session's; else one per trigger (its newest replaces its last); else
 *  one per kind of the daemon's own news. */
export const pushTag = (ref: string, data: { session_id?: string | null; kind?: string; trigger?: string | null }) =>
  data.session_id
    ? sessionTag(ref, data.session_id)
    : data.kind === 'trigger' && data.trigger
      ? `${ref}:trigger:${data.trigger}`
      : sessionTag(ref, data.kind ?? 'news')

/** What a close found and did (`lib/push-log.ts` keeps it): tags only. */
export interface CloseOutcome {
  /** The tags it was asked to close. */
  asked: string[]
  /** The registration's notifications before it closed any: tag and when each came (epoch ms). */
  present: { tag: string; at: number | null }[]
  /** The tags it closed. */
  closed: string[]
  /** The tags it was asked to close and found, but kept so one stays on screen (`keepOne`). */
  held: string[]
}

/** When a notification came: the time the worker put in its data (Safari has no `timestamp`), else its own. */
export const shownAt = (n: Pick<ShownNotification, 'timestamp' | 'data'>): number | null => {
  const at = (n.data as { at?: unknown } | null | undefined)?.at
  return typeof at === 'number' ? at : typeof n.timestamp === 'number' ? n.timestamp : null
}

/**
 * Closes the notifications of these sessions of daemon `ref`. `keepOne`: a push that only takes
 * notifications away (`kind: "clear"`) must leave one of them on screen, or Chrome shows a notice of its
 * own ("updated in the background"): if closing would leave none, it closes none, and the next push (or
 * the app, opened) takes them away instead.
 */
export async function closeSessions(
  registration: NotificationRegistration,
  ref: string,
  sessions: readonly string[],
  keepOne = false,
): Promise<CloseOutcome> {
  const asked = sessions.map((id) => sessionTag(ref, id))
  if (!asked.length) return { asked, present: [], closed: [], held: [] }
  const tags = new Set(asked)
  const shown = await registration.getNotifications()
  const present = shown.map((n) => ({ tag: n.tag, at: shownAt(n) }))
  const closing = shown.filter((n) => tags.has(n.tag))
  if (keepOne && closing.length >= shown.length) return { asked, present, closed: [], held: closing.map((n) => n.tag) }
  for (const n of closing) n.close()
  return { asked, present, closed: closing.map((n) => n.tag), held: [] }
}

/** Whether a notification that replaces one of the same session alerts again: only when the owner is
 *  needed (a finished turn after a finished turn updates it quietly). */
export const alertsAgain = (kind: string | undefined) => kind === 'attention' || kind === 'trigger'
