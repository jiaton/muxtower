import type { Daemon, StreamAuth } from '@/lib/daemons/types'
import { responseKind } from './client'
import { countFrame } from '@/lib/diagnostics'
import { Heartbeat } from './heartbeat'
import { openSocket } from './stream-open'
import type { StreamStatus } from './stream-status'
import type { ServerFrame, StreamPing, StreamSubscribe } from './types'
import { onResume } from '../resume'

interface Handlers {
  onFrame: (frame: ServerFrame) => void
  /** The daemon rejected the token (401): the caller stops this stream. */
  onRejected?: () => void
  onStatus: (status: StreamStatus) => void
  onAuth: (method: StreamAuth) => void
}

const ORDER: StreamAuth[] = ['cookie', 'subprotocol', 'query']
const MAX_BACKOFF_MS = 15000
const BLOCKED_RETRY_MS = 60000
export { QUERY_TOKEN } from './stream-open'

const keyOf = (m: StreamSubscribe) => (m.topic === 'screen' ? `screen:${m.session_id}` : m.topic)

/**
 * One /v1/stream socket for one daemon. Auth is tried in order of safety: an HttpOnly cookie (only when
 * the app is served from the daemon itself), the token as a WebSocket subprotocol (not in the URL), and
 * last the token as a query parameter (for proxies that pass nothing else). The method that worked is
 * reported through onAuth so it is tried first next time.
 *
 * Before any handshake, one plain HTTP call checks that the request gets through at all: a revoked
 * token (onRejected) or a sign-in gate in front (status `blocked`) then costs a single refused request
 * instead of a series of refused handshakes, which a gate or fail2ban would count as guessing.
 *
 * Coming back (the page shown again, the network back) connects at once instead of at the end of the
 * backoff, or asks an open connection whether it still works; so does a while without any frame.
 */
export class DaemonStream {
  private ws: WebSocket | null = null
  private readonly subs = new Map<string, { message: StreamSubscribe; refs: number }>()
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private halted = false
  private rejected = false
  private connecting = false
  private readonly heartbeat = new Heartbeat(
    () => this.send({ type: 'ping' }),
    () => this.dead(),
  )
  private readonly woken = () => {
    if (globalThis.document?.visibilityState !== 'hidden') this.wake()
  }
  private readonly daemon: Daemon
  private readonly handlers: Handlers

  constructor(daemon: Daemon, handlers: Handlers) {
    this.daemon = daemon
    this.handlers = handlers
  }

  private unwatch: (() => void) | undefined

  start() {
    this.unwatch = onResume(this.woken) // shown again, restored, focused or back online: at once
    void this.connect()
  }

  stop() {
    this.stopped = true
    this.unwatch?.()
    clearTimeout(this.timer)
    this.heartbeat.stop()
    this.ws?.close()
  }

  /** Back in view, or back online: connect now if not connected, else check the connection. */
  wake() {
    if (this.stopped || this.rejected) return
    if (this.ws) {
      this.heartbeat.ask()
      return
    }
    if (this.connecting) return
    clearTimeout(this.timer)
    this.retry = 0
    void this.connect()
  }

  /** Nothing came back: drop the socket without waiting for the browser to notice, and connect again. */
  private dead() {
    const ws = this.ws
    if (!ws) return
    ws.onclose = null
    ws.onmessage = null
    ws.close()
    this.ws = null
    this.heartbeat.stop()
    this.handlers.onStatus('offline')
    this.retry = 0
    void this.connect()
  }

  subscribe(message: StreamSubscribe): () => void {
    const key = keyOf(message)
    const existing = this.subs.get(key)
    if (existing) existing.refs++
    else {
      this.subs.set(key, { message, refs: 1 })
      this.send(message)
    }
    return () => {
      const sub = this.subs.get(key)
      if (!sub || --sub.refs > 0) return
      this.subs.delete(key)
      this.send({ ...message, type: 'unsubscribe' })
    }
  }

  /** Asks for a topic again (a screen whose patch did not fit: a whole one comes back). */
  resubscribe(message: StreamSubscribe) {
    const sub = this.subs.get(keyOf(message))
    if (sub) this.send(sub.message)
  }

  private send(message: StreamSubscribe | StreamPing) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  methods(origin = globalThis.location?.origin): StreamAuth[] {
    const sameOrigin = new URL(this.daemon.url).origin === origin
    const available = ORDER.filter((m) => m !== 'cookie' || sameOrigin)
    const preferred = this.daemon.streamAuth
    return preferred && available.includes(preferred) ? [preferred, ...available.filter((m) => m !== preferred)] : available
  }

  private async probe(): Promise<'ok' | 'rejected' | 'blocked' | 'error'> {
    try {
      const res = await fetch(`${this.daemon.url}/v1/me`, { headers: { Authorization: `Bearer ${this.daemon.token}` } })
      return responseKind(res)
    } catch {
      return 'error' // offline: the normal backoff retries
    }
  }

  /** Stops this round of connecting; true when the caller must not try further methods. */
  private refused(kind: 'rejected' | 'blocked'): true {
    if (kind === 'rejected') {
      this.rejected = true
      this.handlers.onStatus('offline')
      this.handlers.onRejected?.()
    } else {
      this.handlers.onStatus('blocked')
      this.timer = setTimeout(() => void this.connect(), BLOCKED_RETRY_MS)
    }
    this.halted = true
    return true
  }

  private async connect() {
    this.connecting = true
    try {
      await this.attempt()
    } finally {
      this.connecting = false
    }
  }

  private async attempt() {
    this.halted = false
    this.handlers.onStatus('connecting')
    const kind = await this.probe()
    if (kind === 'rejected' || kind === 'blocked') {
      this.refused(kind)
      return
    }
    for (const method of this.methods()) {
      if (this.stopped || this.halted) return
      const ws = await openSocket(this.daemon, method)
      if (ws === 'rejected' || ws === 'blocked') {
        this.refused(ws)
        return
      }
      if (ws) {
        if (this.stopped) {
          ws.close()
          return
        }
        this.attach(ws, method)
        return
      }
    }
    this.handlers.onStatus('offline')
    this.reconnectLater()
  }

  private attach(ws: WebSocket, method: StreamAuth) {
    this.ws = ws
    this.retry = 0
    this.handlers.onAuth(method)
    this.handlers.onStatus('open')
    this.heartbeat.heard()
    ws.onmessage = (event) => {
      this.heartbeat.heard()
      countFrame(String(event.data).length)
      try {
        const frame = JSON.parse(String(event.data)) as ServerFrame
        if (frame.type !== 'pong') this.handlers.onFrame(frame)
      } catch {
        // A malformed frame is dropped; the next one carries the full state again.
      }
    }
    ws.onclose = () => {
      this.ws = null
      this.heartbeat.stop()
      if (this.stopped) return
      this.handlers.onStatus('offline')
      this.reconnectLater()
    }
    for (const { message } of this.subs.values()) ws.send(JSON.stringify(message))
  }

  private reconnectLater() {
    if (this.stopped) return
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retry++)
    this.timer = setTimeout(() => void this.connect(), delay)
  }
}
