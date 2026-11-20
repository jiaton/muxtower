import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { Session } from '@/lib/api/types'
import type { PushClickRecord } from '@/lib/push-click'
import { takePushClicks } from '@/lib/push-click-store'
import { appRecord, postClicks } from '../api/report-clicks'
import { pushSupport } from '../api/use-push'

/** How long after a click the app posts the service worker's own record of it (kept in IndexedDB), by
 *  then complete (`ACK_MS` plus `FOCUS_MS`, and some). */
const KEPT_AFTER_MS = 3000

interface NavigateMessage {
  type?: string
  url?: unknown
  click?: PushClickRecord
}

/** A notification tapped while the app is open: the service worker asks the app to go there (it cannot
 *  navigate a page it does not control), and the app goes, without reloading, and says so on the port the
 *  message came with (else the worker falls back: `lib/push-click.ts`). Both sides' records of the click
 *  are posted to the daemon: the worker's from IndexedDB, at start and after a click. */
export function useNotificationClicks() {
  const router = useRouter()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const workers = navigator.serviceWorker
    let later: ReturnType<typeof setTimeout> | undefined
    const postKept = () => void takePushClicks().then((records) => postClicks(records))
    const message = (e: MessageEvent) => {
      const data = e.data as NavigateMessage | null
      if (data?.type !== 'navigate' || typeof data.url !== 'string') return
      const from = location.pathname
      router.history.push(data.url)
      e.ports[0]?.postMessage({ type: 'navigated' })
      if (data.click) void postClicks([appRecord(data.click, from, import.meta.env.BASE_URL)], data.url)
      clearTimeout(later)
      later = setTimeout(postKept, KEPT_AFTER_MS)
    }
    workers.addEventListener('message', message)
    // Messages from a service worker wait in a queue that addEventListener does not open (onmessage or
    // the document's load does); opened here, a tap that starts the app is not held until then.
    workers.startMessages?.()
    postKept() // clicks no window answered, kept since the last start
    return () => {
      clearTimeout(later)
      workers.removeEventListener('message', message)
    }
  }, [router])
}

/** Whether daemon `daemonId`'s session `sessionId` is settled (seen and answered), by what the app knew
 *  of it at `since` (epoch ms) or later; undefined when it knows nothing that recent. */
export type Settled = (daemonId: string, sessionId: string, since: number) => boolean | undefined

/** Whether a notification of `sessionId` can go, by a daemon's list as the app last had it (`known`): the
 *  session is settled (seen and answered), archived, or gone from a list newer than the notification;
 *  undefined when the app knows nothing that recent. */
export function settledIn(
  known: { updatedAt: number; sessions: Session[] } | undefined,
  sessionId: string,
  since: number,
  settled: (session: Session) => boolean,
): boolean | undefined {
  if (!known || known.updatedAt < since) return undefined
  const session = known.sessions.find((s) => s.id === sessionId)
  return session === undefined || Boolean(session.archived_at) || settled(session)
}

/** Closes this device's notifications of sessions that are settled: whenever what the app knows of its
 *  sessions changes (`version`), and when it comes back to the front. Only by news newer than a
 *  notification: a list from before it came cannot say it has been seen. */
export function useCloseSettledNotifications(settled: Settled, version: unknown) {
  const latest = useRef(settled)
  latest.current = settled

  useEffect(() => {
    const timer = setTimeout(() => void closeSettled(latest.current), 300) // a burst of updates: once
    return () => clearTimeout(timer)
  }, [version])

  useEffect(() => {
    const shown = () => void closeSettled(latest.current)
    document.addEventListener('visibilitychange', shown)
    return () => document.removeEventListener('visibilitychange', shown)
  }, [])
}

async function closeSettled(settled: Settled) {
  if (pushSupport() !== 'ok' || document.visibilityState !== 'visible') return
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    for (const shown of await registration.getNotifications()) {
      const at = shown.tag.indexOf(':') // `${daemonId}:${sessionId}`, as the service worker tags them
      const since = (shown.data as { at?: number } | null)?.at ?? (shown as { timestamp?: number }).timestamp
      if (at > 0 && since && settled(shown.tag.slice(0, at), shown.tag.slice(at + 1), since)) shown.close()
    }
  }
}
