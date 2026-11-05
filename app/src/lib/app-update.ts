import { create } from 'zustand'

/**
 * A new version of the app, deployed while it is open. Its service worker takes over at once (sw.ts) and
 * drops the old version's files, which the open app still loads its pages from. So the app goes over to
 * it: at once while it is out of sight; while it is in front, it says so ("A new version is available ·
 * Reload") and goes over when told to, or when it is next put away. Never in the middle of typing.
 *
 * The browser looks for a new worker only when a page is opened, so an app left open (a desktop tab, a
 * PWA) asks for one itself: when it comes back into sight, every half hour, and when a daemon says it runs
 * a newer muxtower than this app is (`newer`).
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? ''
const CHECK_EVERY_MS = 30 * 60_000

export const useAppUpdate = create<{ ready: boolean }>()(() => ({ ready: false }))

export function lookForUpdate() {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => {}) // offline, or the daemon down: next time
}

export function watchForUpdates() {
  const workers = 'serviceWorker' in navigator ? navigator.serviceWorker : null
  if (!workers) return
  let controlled = Boolean(workers.controller)
  workers.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true // the first worker taking over a page that came from the network: nothing new
      return
    }
    if (document.visibilityState === 'hidden') location.reload()
    else useAppUpdate.setState({ ready: true })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useAppUpdate.getState().ready) location.reload()
    else if (document.visibilityState === 'visible') lookForUpdate()
  })
  setInterval(lookForUpdate, CHECK_EVERY_MS)
}

/** Whether version `a` is newer than `b` ("0.1.50" > "0.1.9"); false when either is not a version. */
export function newer(a: string | null | undefined, b: string | null | undefined): boolean {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10))
  if (!a || !b || !/^\d+(\.\d+)*$/.test(a) || !/^\d+(\.\d+)*$/.test(b)) return false
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

/** Reloads into the newest app there is: fetches a new worker first, if there is one, and waits (a few
 *  seconds at most) for it to take over, since a plain reload is served the cached version. */
export async function reloadIntoNewest() {
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined
  if (registration && !useAppUpdate.getState().ready) {
    await registration.update().catch(() => {})
    if (registration.installing || registration.waiting) {
      await new Promise<void>((done) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true })
        setTimeout(done, 5000)
      })
    }
  }
  location.reload()
}
