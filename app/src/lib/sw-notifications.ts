/** How the service worker takes notifications away (`sw.ts`), apart from it so it can be tested. */

/** What the service worker sees of a notification it shows. */
export interface ShownNotification {
  tag: string
  close: () => void
}

export interface NotificationRegistration {
  getNotifications: () => Promise<ShownNotification[]>
}

/** A session's notification: one per session of a daemon (`ref`), replaced in place by the next. */
export const sessionTag = (ref: string, sessionId: string) => `${ref}:${sessionId}`

/**
 * Closes the notifications of these sessions of daemon `ref`; returns how many. `keepOne`: a push that
 * only takes notifications away (`kind: "clear"`) must leave one of them on screen, or Chrome shows a
 * notice of its own ("updated in the background"): if closing would leave none, it closes none, and the
 * next push (or the app, opened) takes them away instead.
 */
export async function closeSessions(
  registration: NotificationRegistration,
  ref: string,
  sessions: readonly string[],
  keepOne = false,
): Promise<number> {
  if (!sessions.length) return 0
  const tags = new Set(sessions.map((id) => sessionTag(ref, id)))
  const shown = await registration.getNotifications()
  const closing = shown.filter((n) => tags.has(n.tag))
  if (keepOne && closing.length >= shown.length) return 0
  for (const n of closing) n.close()
  return closing.length
}

/** Whether a notification that replaces one of the same session alerts again: only when the owner is
 *  needed (a finished turn after a finished turn updates it quietly). */
export const alertsAgain = (kind: string | undefined) => kind === 'attention'
