import { createDaemonClient } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'

/**
 * A log of what the phone's media controls do while Live and Read aloud hold them (`car-media.ts`), told
 * to the hub (POST /v1/diagnostics, source `media`: `<state_dir>/diagnostics/media.jsonl`), so what a
 * car's buttons did can be read there afterwards. Events only: action names, states, timings, error names
 * and messages; never what is said, a summary, a reply or a session's name.
 *
 * Each entry: `run` (random, one per hold: not a muxtower session), `t` (ms since the hold began), `e`
 * (the event) and its fields; the first entry of each batch also has `ua` (the browser). Sent every 5 s,
 * or at once at 20 entries, at most one request at a time; kept to 200 while the hub cannot be reached
 * (the oldest dropped, counted in the next entry sent).
 */

export const SOURCE = 'media'
export const FLUSH_MS = 5000
export const FLUSH_AT = 20
const KEEP = 200
const TEXT = 200 // characters a string field holds at most (an error's message)

export type Field = string | number | boolean | null | undefined
export interface MediaEntry {
  run: string
  t: number
  e: string
  ua?: string
  [field: string]: Field
}

let run: { id: string; started: number; daemonId: string | null } | null = null
let queue: MediaEntry[] = []
let dropped = 0
let timer: ReturnType<typeof setTimeout> | undefined
let sending: Promise<void> | null = null

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function randomId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A hold began: a new run, its entries told to `daemonId`'s hub (the session in front's), else the first
 *  daemon paired. */
export function startMediaLog(daemonId: string | null) {
  if (run) return
  run = { id: randomId(), started: clock(), daemonId }
  logMedia('log-start')
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
}

/** The hold ended: what is left is sent, and nothing more is logged until the next. */
export function stopMediaLog() {
  if (!run) return
  logMedia('log-stop')
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  void flushMediaLog()
  run = null
}

/** Which hub the log goes to, once the session in front is known. */
export function logTo(daemonId: string | null) {
  if (run && daemonId) run.daemonId = daemonId
}

export function mediaLogRunning(): boolean {
  return run !== null
}

function onVisibility() {
  logMedia('visibility', { state: document.visibilityState })
  if (document.visibilityState === 'hidden') void flushMediaLog() // sent while the page may still run
}

/** Logs an event of the current run (none: nothing). Fields are kept only as numbers, booleans and short
 *  strings: callers pass names and states, never content. */
export function logMedia(event: string, fields: Record<string, Field> = {}) {
  if (!run) return
  const entry: MediaEntry = { run: run.id, t: Math.round(clock() - run.started), e: event }
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    entry[k] = typeof v === 'string' ? v.slice(0, TEXT) : typeof v === 'number' ? Math.round(v * 100) / 100 : v
  }
  queue.push(entry)
  if (queue.length > KEEP) {
    dropped += queue.length - KEEP
    queue = queue.slice(-KEEP)
  }
  if (queue.length >= FLUSH_AT) void flushMediaLog()
  else if (timer === undefined) timer = setTimeout(() => void flushMediaLog(), FLUSH_MS)
}

/** An error, as the log keeps it: its name and message (a DOMException's: NotAllowedError…). */
export function errorFields(error: unknown): { error: string; message: string } {
  if (error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException))
    return { error: (error as Error).name, message: (error as Error).message }
  return { error: typeof error, message: String(error) }
}

/** Sends what is queued (one request at a time: one asked for meanwhile follows it); never throws. */
export async function flushMediaLog(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  if (sending) {
    await sending
    return flushMediaLog()
  }
  if (queue.length === 0) return
  sending = send()
  try {
    await sending
  } finally {
    sending = null
  }
  if (queue.length && timer === undefined) timer = setTimeout(() => void flushMediaLog(), FLUSH_MS)
}

async function send() {
  const daemons = useDaemonsStore.getState().daemons
  const daemon = daemons.find((d) => d.id === run?.daemonId && d.token) ?? daemons.find((d) => d.token && !d.rejected)
  if (!daemon) return
  const batch = queue.splice(0, FLUSH_AT * 5)
  batch[0] = { ...batch[0]!, ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '' }
  if (dropped) batch[0] = { ...batch[0]!, dropped }
  const lost = dropped
  dropped = 0
  try {
    const { error } = await createDaemonClient(daemon).POST('/v1/diagnostics', { body: { source: SOURCE, entries: batch } as never })
    if (error) throw new Error('rejected')
  } catch {
    queue = [...batch.map(({ ua: _, dropped: __, ...e }) => e as MediaEntry), ...queue].slice(-KEEP) // tried again later
    dropped += lost
  }
}

/** Tests: forget everything. */
export function resetMediaLog() {
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  clearTimeout(timer)
  timer = undefined
  run = null
  queue = []
  dropped = 0
  sending = null
}
