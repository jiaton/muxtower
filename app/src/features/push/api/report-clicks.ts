import { createDaemonClient } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import type { ClickWindow, PushClickRecord } from '@/lib/push-click'
import { routePattern } from '@/lib/route-pattern'

/**
 * Tapped notifications, told to the daemon (POST /v1/diagnostics, source `push-click`): what the service
 * worker found and did (`lib/push-click.ts`) and, when the app got the message, how long it took and where
 * it was. Route patterns, visibility and timings only: no ids, session names or text.
 */
const SOURCE = 'push-click'

const window_ = (w: ClickWindow): ClickWindow => ({ path: routePattern(String(w.path)), visibility: String(w.visibility), focused: Boolean(w.focused) })
/** The app's base path (the deployment's, not a secret), or `/` when it does not look like one. */
const basePath = (base: unknown) => (typeof base === 'string' && /^\/[\w./-]{0,100}$/.test(base) && !base.includes('..') ? base : '/')
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null)

/** The entry posted for a record: only its known fields, the paths made route patterns again (a record
 *  from IndexedDB or a message is not trusted to be one). */
export function clickEntry(r: PushClickRecord): PushClickRecord {
  return {
    id: String(r.id).slice(0, 40),
    at: String(r.at).slice(0, 40),
    stage: r.stage === 'app' ? 'app' : 'sw',
    base: basePath(r.base),
    target: routePattern(String(r.target), basePath(r.base)),
    windows: (Array.isArray(r.windows) ? r.windows : []).slice(0, 20).map(window_),
    others: (Array.isArray(r.others) ? r.others : []).slice(0, 20).map(window_),
    chosen: num(r.chosen),
    message: r.message,
    ack: typeof r.ack === 'boolean' ? r.ack : null,
    ackMs: num(r.ackMs),
    focus: r.focus,
    fallback: r.fallback,
    ms: num(r.ms) ?? 0,
    ...(r.app ? { app: { ms: num(r.app.ms) ?? 0, from: routePattern(String(r.app.from)) } } : {}),
  }
}

/** The app's part of a click it was told of: the worker's record so far, how long the message took, and
 *  the page it was on (`from`, a path). */
export function appRecord(click: PushClickRecord, from: string, base: string, now = Date.now()): PushClickRecord {
  return { ...click, stage: 'app', app: { ms: now - Date.parse(click.at), from: routePattern(from, base) } }
}

/** The daemon the notification's URL names (`<base>d/<id>/…`), if paired, else the first paired one. */
function daemonFor(url: string | undefined, base: string) {
  const daemons = useDaemonsStore.getState().daemons.filter((d) => d.token && !d.rejected)
  const id = url?.startsWith(`${base}d/`) ? decodeURIComponent(url.slice(base.length + 2).split('/')[0] ?? '') : undefined
  return daemons.find((d) => d.id === id) ?? daemons.find((d) => !d.via) ?? daemons[0]
}

/** Posts the records to the daemon; never throws. */
export async function postClicks(records: PushClickRecord[], url?: string, base = import.meta.env.BASE_URL): Promise<void> {
  try {
    if (!records.length) return
    const daemon = daemonFor(url, base)
    if (!daemon) return
    await createDaemonClient(daemon).POST('/v1/diagnostics', { body: { source: SOURCE, entries: records.map(clickEntry) } as never })
  } catch {
    // a log must never be what breaks
  }
}
