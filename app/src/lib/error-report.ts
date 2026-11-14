import { createDaemonClient } from './api/client'
import { APP_VERSION } from './app-update'
import { useDaemonsStore } from './daemons/store'
import { routePattern } from './web-analytics'

/**
 * What goes wrong in the app, told to the daemon it is paired with (POST /v1/diagnostics, source
 * `app-errors`, where the daemon logs it): the message, the stack (its files are the app's own, mapped
 * with the build's hidden source maps), the app's version, the page as its route pattern (no daemon or
 * session ids, nothing typed) and the browser. At most a few a minute, each message once per page.
 */
const SOURCE = 'app-errors'
const MAX_PER_MINUTE = 5
const sent = new Set<string>()
let recent: number[] = []

export interface AppErrorReport {
  kind: 'render' | 'error' | 'rejection'
  message: string
  stack?: string
  version: string
  route: string
  browser: string
  at: string
}

/** The report of `error` (pure, for tests). */
export function describe(kind: AppErrorReport['kind'], error: unknown, path = location.pathname): AppErrorReport {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  return {
    kind,
    message: e.message.slice(0, 500),
    stack: e.stack?.slice(0, 4000),
    version: APP_VERSION,
    route: routePattern(path, import.meta.env.BASE_URL),
    browser: navigator.userAgent.slice(0, 300),
    at: new Date().toISOString(),
  }
}

/** Whether another report may go now (throttled, each message once). */
export function mayReport(message: string, now = Date.now()): boolean {
  recent = recent.filter((t) => now - t < 60_000)
  if (sent.has(message) || recent.length >= MAX_PER_MINUTE) return false
  sent.add(message)
  recent.push(now)
  return true
}

/** Reports it to the first daemon this device is paired with; never throws. */
export function reportError(kind: AppErrorReport['kind'], error: unknown) {
  try {
    const report = describe(kind, error)
    if (!mayReport(report.message)) return
    const daemon = useDaemonsStore.getState().daemons.find((d) => d.token && !d.rejected)
    if (!daemon) return
    void createDaemonClient(daemon)
      .POST('/v1/diagnostics', { body: { source: SOURCE, entries: [{ ...report }] } as never })
      .catch(() => {})
  } catch {
    // reporting must never be what breaks
  }
}

/** Uncaught errors and unhandled rejections of the page, reported. */
export function watchErrors() {
  addEventListener('error', (e) => {
    if (e.error) reportError('error', e.error) // not a resource that failed to load (the recover script's)
  })
  addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason))
}
