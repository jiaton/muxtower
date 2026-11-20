/// <reference lib="webworker" />
// One script, several registrations: the root one caches the app shell; one per daemon (scope
// <base>push/<daemonId>/) holds that daemon's push subscription, since each daemon has its own VAPID key
// and a registration can only hold one subscription.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NOT_THE_APP } from './lib/sw-routes'
import { alertsAgain, closeSessions, pushTag } from './lib/sw-notifications'
import { appBaseOf, openFromNotification } from './lib/push-click'
import { savePushClick } from './lib/push-click-store'

declare const self: ServiceWorkerGlobalScope

// A new version takes over at once, and the open app reloads into it (`reloadOnUpdate`). Without this
// it waits until every tab of the app is closed, which on a phone can be never.
void self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// A reload of any page (`/d/…/s/…`) is the cached app, not the network: with the daemon's machine down,
// the page would be its proxy's error page (`lib/sw-routes.ts`).
registerRoute(new NavigationRoute(createHandlerBoundToURL(new URL('index.html', self.location.href).href), { denylist: NOT_THE_APP }))

interface PushPayload {
  client_ref: string
  session_id?: string | null // none for news of the daemon itself (its Claude login expired)
  session_name?: string | null
  kind?: 'attention' | 'done' | 'login' | 'recovery' | 'trigger' | 'clear'
  trigger?: string | null // the trigger a `trigger` push is about
  title: string
  body: string
  settled?: string[] // sessions notified about before, seen or answered since
}

/** The app's base path, as this registration's scope gives it. */
const appBase = () => new URL(appBaseOf(self.registration.scope)).pathname

self.addEventListener('push', (event) => {
  const data = event.data?.json() as PushPayload | undefined
  if (!data) return
  // Only notifications that no longer matter (read, answered or gone elsewhere): the daemon sends this
  // while the device shows another of its own, and none is closed if that one would be the last.
  if (data.kind === 'clear') return event.waitUntil(closeSessions(self.registration, data.client_ref, data.settled ?? [], true))
  const url = data.session_id ? `${appBase()}d/${encodeURIComponent(data.client_ref)}/s/${encodeURIComponent(data.session_id)}` : appBase()
  event.waitUntil(
    // One notification per session: a newer one replaces it (a finished turn replaces a handled
    // approval), alerting again only when the owner is needed. Something waiting for you stays on screen until dismissed or settled
    // (seen or answered): the app closes those it sees settled, and each push names the ones settled since.
    Promise.all([
      closeSessions(self.registration, data.client_ref, data.settled ?? []),
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: pushTag(data.client_ref, data),
        renotify: alertsAgain(data.kind),
        requireInteraction: data.kind !== 'done',
        timestamp: Date.now(),
        data: { url, at: Date.now() }, // when it came (Safari has no `timestamp`)
        icon: `${appBase()}icon-192.png`, // Android draws no SVG here
        badge: `${appBase()}badge-96.png`, // the status bar's monochrome mark; without it, the browser's
      } as NotificationOptions),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url: string }).url
  // At once, no network: the app's best window is told where to go and, once it says it went, brought
  // forward; else it is navigated (if this worker controls it) or a new window opens (`lib/push-click.ts`).
  // What happened is kept for the app to post (`push-click` diagnostics).
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const record = await openFromNotification(url, all, appBaseOf(self.registration.scope), {
        openWindow: (to) => self.clients.openWindow(to),
      })
      console.info('[push-click]', JSON.stringify(record))
      await savePushClick(record)
    })(),
  )
})
