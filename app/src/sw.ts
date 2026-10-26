/// <reference lib="webworker" />
// One script, several registrations: the root one caches the app shell; one per daemon (scope
// <base>push/<daemonId>/) holds that daemon's push subscription, since each daemon has its own VAPID key
// and a registration can only hold one subscription.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// A new version takes over at once, and the open app reloads into it (registerType: 'autoUpdate').
// Without this it waits until every tab of the app is closed, which on a phone can be never.
void self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

interface PushPayload {
  client_ref: string
  session_id: string
  session_name: string
  kind?: 'attention' | 'done'
  title: string
  body: string
}

const appBase = () => {
  const scope = new URL(self.registration.scope)
  return scope.pathname.replace(/push\/[^/]+\/$/, '')
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() as PushPayload | undefined
  if (!data) return
  const url = `${appBase()}d/${encodeURIComponent(data.client_ref)}/s/${encodeURIComponent(data.session_id)}`
  event.waitUntil(
    // One notification per session: a newer one replaces it (a finished turn replaces a handled
    // approval) and alerts again. Something waiting for you stays on screen until dismissed.
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: `${data.client_ref}:${data.session_id}`,
      renotify: true,
      requireInteraction: data.kind !== 'done',
      timestamp: Date.now(),
      data: { url },
      icon: `${appBase()}icon-192.png`, // Android draws no SVG here
      badge: `${appBase()}badge-96.png`, // the status bar's monochrome mark; without it, the browser's
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url: string }).url
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          await client.navigate(url).catch(() => client.postMessage({ type: 'navigate', url }))
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
