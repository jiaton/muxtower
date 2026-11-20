/**
 * A tapped notification, as the service worker handles it (`sw.ts`), apart from it so it can be tested.
 *
 * The notification belongs to a daemon's registration (scope `<base>push/<daemonId>/`), which controls no
 * page of the app: it cannot navigate the app's windows, only message them. So the best app window is
 * sent `navigate` with a port, and the app answers on it once it has gone there (`useNotificationClicks`).
 * Only then is the window brought forward: a click allows one window interaction (Chrome consumes it with
 * the first focus() or openWindow()), so it is kept for the fallback until the app has answered. With no
 * answer within ACK_MS, the window is navigated if this worker controls it, else a window opens on the URL.
 *
 * Every click leaves a record (`PushClickRecord`: route patterns, visibility, timings; no ids, names or
 * text), which the app posts to its daemon as `push-click` diagnostics.
 */
import { routePattern } from './route-pattern'

/** How long the app may take to answer `navigate` before the fallback. */
export const ACK_MS = 500
/** How long a window may take to come forward (a frozen tab can keep focus() waiting, and Chrome shows
 *  "processing" all the while). */
export const FOCUS_MS = 1500

/** What the worker sees of a window on its origin (a `WindowClient`). */
export interface AppWindow {
  url: string
  focused: boolean
  visibilityState: string
  focus(): Promise<unknown>
  postMessage(message: unknown, transfer: Transferable[]): void
  /** Rejects unless this worker controls the window. */
  navigate?(url: string): Promise<unknown>
}

export interface ClickWindow {
  path: string // the route pattern
  visibility: string
  focused: boolean
}

export interface PushClickRecord {
  id: string
  at: string
  stage: 'sw' | 'app' // the worker's whole record (stored, posted by the app later), or what the app saw
  base: string // the app's base path, as the registration's scope gives it
  target: string // where the notification points, as a route pattern
  windows: ClickWindow[] // the app's windows, best first
  others: ClickWindow[] // other windows on the origin (the glasses page, or a page outside the base)
  chosen: number | null // index into `windows`
  message: 'sent' | 'failed' | 'none'
  ack: boolean | null
  ackMs: number | null
  focus: 'ok' | 'failed' | 'timeout' | 'skipped' | null
  fallback: 'none' | 'navigate' | 'open' | 'open-failed'
  ms: number // from the click to the end of the worker's part
  app?: { ms: number; from: string } // added by the app: how long the message took, where it was
}

/** The app's base URL (ending in `/`) from a registration's scope: the root one's, or a daemon's
 *  (`<base>push/<daemonId>/`). */
export function appBaseOf(scope: string): string {
  const url = new URL(scope)
  const path = url.pathname.replace(/push\/[^/]+\/?$/, '').replace(/\/?$/, '/')
  return url.origin + path
}

/** Whether a window is the app's (not the glasses page, nor anything else on the origin): same origin,
 *  its path the base (with or without its trailing slash) or under it. */
export function isAppWindow(url: string, base: string): boolean {
  let page: URL
  let root: URL
  try {
    page = new URL(url)
    root = new URL(base)
  } catch {
    return false
  }
  if (page.origin !== root.origin) return false
  const prefix = root.pathname.replace(/\/?$/, '/')
  if (page.pathname !== prefix.slice(0, -1) && !page.pathname.startsWith(prefix)) return false
  return !/^(g2|push)(\/|$)/.test(page.pathname.slice(prefix.length))
}

const rank = (w: AppWindow) => (w.focused ? 2 : w.visibilityState === 'visible' ? 1 : 0)

/** The app's windows, the one in front first, and the rest. */
export function sortWindows<W extends AppWindow>(all: readonly W[], base: string): { windows: W[]; others: W[] } {
  const windows = all.filter((w) => isAppWindow(w.url, base)).sort((a, b) => rank(b) - rank(a))
  return { windows, others: all.filter((w) => !windows.includes(w)) }
}

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

const describe = (w: AppWindow, base: string): ClickWindow => ({
  path: isAppWindow(w.url, base) ? routePattern(pathOf(w.url), new URL(base).pathname) : routePattern(pathOf(w.url)),
  visibility: w.visibilityState,
  focused: w.focused,
})

export interface ClickEnv {
  openWindow: (url: string) => Promise<unknown>
  now?: () => number
  id?: string
  ackMs?: number
  focusMs?: number
}

/** Resolves with how long the app took to answer on `port`, or null after `ms`. */
function answer(port: MessagePort, ms: number, now: () => number): Promise<number | null> {
  const start = now()
  return new Promise((resolve) => {
    const done = (value: number | null) => {
      clearTimeout(timer)
      port.onmessage = null
      port.close()
      resolve(value)
    }
    const timer = setTimeout(() => done(null), ms)
    port.onmessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'navigated') done(now() - start)
    }
  })
}

async function bringForward(w: AppWindow, ms: number): Promise<'ok' | 'failed' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), ms)))
  const focusing = w.focus().then(
    (c) => (c ? ('ok' as const) : ('failed' as const)),
    () => 'failed' as const,
  )
  const result = await Promise.race([focusing, late])
  clearTimeout(timer)
  return result
}

/** Takes the app to `url` (the notification's `data.url`), from `all` the windows on the origin; returns
 *  the click's record. No network, nothing awaited for long. */
export async function openFromNotification(url: string, all: readonly AppWindow[], base: string, env: ClickEnv): Promise<PushClickRecord> {
  const now = env.now ?? Date.now
  const started = now()
  const { windows, others } = sortWindows(all, base)
  const basePath = new URL(base).pathname
  const record: PushClickRecord = {
    id: env.id ?? `${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(started).toISOString(),
    stage: 'sw',
    base: basePath,
    target: routePattern(pathOf(new URL(url, base).href), basePath),
    windows: windows.map((w) => describe(w, base)),
    others: others.map((w) => describe(w, base)),
    chosen: null,
    message: 'none',
    ack: null,
    ackMs: null,
    focus: null,
    fallback: 'none',
    ms: 0,
  }
  const open = async () => {
    record.fallback = await env.openWindow(url).then(
      () => 'open' as const,
      () => 'open-failed' as const,
    )
  }
  const best = windows[0]
  if (!best) {
    await open()
    return { ...record, ms: now() - started }
  }
  record.chosen = 0
  const channel = new MessageChannel()
  const answered = answer(channel.port1, env.ackMs ?? ACK_MS, now)
  try {
    best.postMessage({ type: 'navigate', url, click: { ...record, ms: now() - started } }, [channel.port2])
    record.message = 'sent'
  } catch {
    record.message = 'failed'
  }
  const ackMs = await answered
  record.ack = ackMs !== null
  record.ackMs = ackMs
  const focusMs = env.focusMs ?? FOCUS_MS
  if (record.ack) {
    record.focus = await bringForward(best, focusMs)
  } else if (best.navigate && (await best.navigate(url).then(() => true, () => false))) {
    record.fallback = 'navigate'
    record.focus = await bringForward(best, focusMs)
  } else {
    record.focus = 'skipped' // the click's one window interaction goes to the new window
    await open()
  }
  return { ...record, ms: now() - started }
}
