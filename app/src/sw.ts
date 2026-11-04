/// <reference lib="webworker" />
// One script, several registrations: the root one caches the app shell; one per daemon (scope
// <base>push/<daemonId>/) holds that daemon's push subscription, since each daemon has its own VAPID key
// and a registration can only hold one subscription.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NOT_THE_APP } from './lib/sw-routes'

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
  kind?: 'attention' | 'done' | 'login'
  title: string
  body: string
  settled?: string[] // sessions notified about before, seen or answered since
}

/** This registration's notifications of these sessions of daemon `ref`, which can go. */
async function closeSettled(ref: string, sessions: string[]) {
  if (!sessions.length) return
  const tags = new Set(sessions.map((id) => `${ref}:${id}`))
  for (const shown of await self.registration.getNotifications()) if (tags.has(shown.tag)) shown.close()
}

const appBase = () => {
  const scope = new URL(self.registration.scope)
  return scope.pathname.replace(/push\/[^/]+\/$/, '')
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() as PushPayload | undefined
  if (!data) return
  const url = data.session_id ? `${appBase()}d/${encodeURIComponent(data.client_ref)}/s/${encodeURIComponent(data.session_id)}` : appBase()
  event.waitUntil(
    // One notification per session: a newer one replaces it (a finished turn replaces a handled
    // approval) and alerts again. Something waiting for you stays on screen until dismissed or settled
    // (seen or answered): the app closes those it sees settled, and each push names the ones settled since.
    Promise.all([
      closeSettled(data.client_ref, data.settled ?? []),
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: `${data.client_ref}:${data.session_id ?? data.kind}`,
        renotify: true,
        requireInteraction: data.kind !== 'done',
        timestamp: Date.now(),
        data: { url, at: Date.now() }, // when it came (Safari has no `timestamp`)
        icon: `${appBase()}icon-192.png`, // Android draws no SVG here
        badge: `${appBase()}badge-96.png`, // the status bar's monochrome mark; without it, the browser's
      } as NotificationOptions),
    ]),
  )
})

/** The app's own windows (not the glasses page or anything else on this origin), the one in front first. */
async function appWindows(): Promise<WindowClient[]> {
  const base = new URL(appBase(), self.location.origin).href
  const rank = (c: WindowClient) => (c.focused ? 2 : c.visibilityState === 'visible' ? 1 : 0)
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.filter((c) => c.url.startsWith(base) && !c.url.startsWith(`${base}g2/`)).sort((a, b) => rank(b) - rank(a))
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url: string }).url
  event.waitUntil(
    (async () => {
      // Brought to the front first, while the tap still allows it, then told where to go: the app goes
      // there itself (`useNotificationClicks`). This registration (a daemon's, for its push subscription)
      // does not control the app's pages, so it cannot navigate them, and a navigation would reload the app.
      for (const client of await appWindows()) {
        const focused = await client.focus().catch(() => null)
        if (focused) {
          focused.postMessage({ type: 'navigate', url })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
