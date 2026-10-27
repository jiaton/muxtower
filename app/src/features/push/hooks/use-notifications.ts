import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { pushSupport } from '../api/use-push'

/** A notification tapped while the app is open: the service worker asks the app to go there (it cannot
 *  navigate a page it does not control), and the app goes, without reloading. */
export function useNotificationClicks() {
  const router = useRouter()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const workers = navigator.serviceWorker
    const message = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: unknown } | null
      if (data?.type === 'navigate' && typeof data.url === 'string') router.history.push(data.url)
    }
    workers.addEventListener('message', message)
    return () => workers.removeEventListener('message', message)
  }, [router])
}

/** Whether daemon `daemonId`'s session `sessionId` is settled (seen and answered), by what the app knew
 *  of it at `since` (epoch ms) or later; undefined when it knows nothing that recent. */
export type Settled = (daemonId: string, sessionId: string, since: number) => boolean | undefined

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
