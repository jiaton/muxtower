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

/** The tag a push is shown under: its session's; else one per trigger (its newest replaces its last); else
 *  one per kind of the daemon's own news. */
export const pushTag = (ref: string, data: { session_id?: string | null; kind?: string; trigger?: string | null }) =>
  data.session_id
    ? sessionTag(ref, data.session_id)
    : data.kind === 'trigger' && data.trigger
      ? `${ref}:trigger:${data.trigger}`
      : sessionTag(ref, data.kind ?? 'news')

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
export const alertsAgain = (kind: string | undefined) => kind === 'attention' || kind === 'trigger'

/** How long a window may take to come to the front before a tapped notification opens a new one instead
 *  (a frozen or discarded tab can keep focus() waiting, and Chrome shows "processing" all the while). */
export const FOCUS_MS = 1500

export interface AppWindow {
  focus(): Promise<unknown>
  postMessage(message: unknown): void
}

/** A tapped notification: no network, nothing awaited but bringing a window forward. The best window
 *  (`windows`, best first) is told where to go at once, then brought forward; if none comes within
 *  FOCUS_MS, a new window opens on the URL. */
export async function openFromNotification(
  url: string,
  windows: AppWindow[],
  openWindow: (url: string) => Promise<unknown>,
  focusMs = FOCUS_MS,
): Promise<void> {
  const best = windows[0]
  if (best) {
    best.postMessage({ type: 'navigate', url }) // it goes there as it comes forward
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), focusMs))
    const focused = await Promise.race([best.focus().catch(() => null), late])
    if (focused) return
  }
  await openWindow(url)
}
