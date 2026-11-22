import { createDaemonClient } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { readPushLog, safeTag, type PushLogRecord } from '@/lib/push-log'

/**
 * The service worker's push log (`lib/push-log.ts`), told to the daemon each push came from (POST
 * /v1/diagnostics, source `push-clear`): what it showed and closed, by tag, and what was on screen.
 * Tags, ids, counts and times only. The records stay on this device (Daemons › Diagnostics shows them);
 * the newest key posted is remembered here, so each goes once.
 */
const SOURCE = 'push-clear'
const POSTED = 'muxtower-push-log-posted'
const BATCH = 50

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const tagList = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .slice(0, 30)
    .map((t) => str(t))
    .filter((t): t is string => t !== null)
    .map(safeTag)

/** The entry posted for a record: only its known fields (a record from IndexedDB is not trusted to be one). */
export function pushLogEntry(r: PushLogRecord) {
  const tag = str(r.tag)
  return {
    at: num(r.at) === null ? null : new Date(r.at).toISOString(),
    event: str(r.event, 10),
    kind: str(r.kind, 20),
    ref: str(r.ref, 100),
    scope: str(r.scope, 100),
    origin: str(r.origin, 200),
    version: str(r.version, 20),
    session: str(r.session),
    tag: tag === null ? null : safeTag(tag),
    asked: tagList(r.asked),
    present: (Array.isArray(r.present) ? r.present : [])
      .slice(0, 30)
      .flatMap((n) => (typeof n?.tag === 'string' ? [{ tag: safeTag(n.tag.slice(0, 120)), at: num(n.at) }] : [])),
    closed: tagList(r.closed),
    held: tagList(r.held),
    keep_one: Boolean(r.keepOne),
  }
}

function postedUpTo(): number {
  try {
    return Number(localStorage.getItem(POSTED) ?? 0) || 0
  } catch {
    return 0
  }
}

let posting: Promise<void> | null = null

/** Posts the records not posted yet, each to the daemon its push came from (by its `ref` or its
 *  registration's scope; else the first paired daemon reached directly); never throws. */
export function postPushLog(): Promise<void> {
  posting ??= post().finally(() => (posting = null))
  return posting
}

async function post() {
  try {
    const after = postedUpTo()
    const fresh = (await readPushLog()).filter((r) => r.key > after)
    if (!fresh.length) return
    const daemons = useDaemonsStore.getState().daemons.filter((d) => d.token && !d.rejected)
    const fallback = daemons.find((d) => !d.via) ?? daemons[0]
    const groups = new Map<(typeof daemons)[number], PushLogRecord[]>()
    for (const { record } of fresh) {
      const daemon = daemons.find((d) => d.id === record.ref || d.id === record.scope) ?? fallback
      if (daemon) groups.set(daemon, [...(groups.get(daemon) ?? []), record])
    }
    for (const [daemon, records] of groups) {
      for (let i = 0; i < records.length; i += BATCH) {
        const entries = records.slice(i, i + BATCH).map(pushLogEntry)
        const { response } = await createDaemonClient(daemon).POST('/v1/diagnostics', { body: { source: SOURCE, entries } as never })
        if (!response.ok) return // kept for the next try
      }
    }
    localStorage.setItem(POSTED, String(fresh[fresh.length - 1]!.key))
  } catch {
    // a log must never be what breaks
  }
}
