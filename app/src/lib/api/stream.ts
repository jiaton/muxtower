import type { Daemon, StreamAuth } from '@/lib/daemons/types'
import { responseKind } from './client'
import type { StreamStatus } from './stream-status'
import type { ServerFrame, StreamSubscribe } from './types'

interface Handlers {
  onFrame: (frame: ServerFrame) => void
  /** The daemon rejected the token (401): the caller stops this stream. */
  onRejected?: () => void
  onStatus: (status: StreamStatus) => void
  onAuth: (method: StreamAuth) => void
}

const ORDER: StreamAuth[] = ['cookie', 'subprotocol', 'query']
const OPEN_TIMEOUT_MS = 8000
const MAX_BACKOFF_MS = 15000
const BLOCKED_RETRY_MS = 60000
/** Not `token`: gates in front of a daemon treat an unknown `?token=` as a password guess. */
export const QUERY_TOKEN = 'access_token'

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
 */
export class DaemonStream {
  private ws: WebSocket | null = null
  private readonly subs = new Map<string, { message: StreamSubscribe; refs: number }>()
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private halted = false
  private readonly daemon: Daemon
  private readonly handlers: Handlers

  constructor(daemon: Daemon, handlers: Handlers) {
    this.daemon = daemon
    this.handlers = handlers
  }

  start() {
    void this.connect()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.ws?.close()
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

  private send(message: StreamSubscribe) {
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
    this.halted = false
    this.handlers.onStatus('connecting')
    const kind = await this.probe()
    if (kind === 'rejected' || kind === 'blocked') {
      this.refused(kind)
      return
    }
    for (const method of this.methods()) {
      if (this.stopped || this.halted) return
      const ws = await this.open(method)
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

  private async open(method: StreamAuth): Promise<WebSocket | null> {
    const { url, token } = this.daemon
    if (!token) return null
    const base = `${url.replace(/^http/, 'ws')}/v1/stream`
    let ws: WebSocket
    try {
      if (method === 'cookie') {
        const res = await fetch(`${url}/v1/stream/cookie`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'same-origin',
        })
        const kind = responseKind(res)
        if (kind === 'rejected' || kind === 'blocked') {
          this.refused(kind)
          return null
        }
        if (!res.ok) return null
        ws = new WebSocket(base, ['muxtower'])
      } else if (method === 'subprotocol') {
        ws = new WebSocket(base, ['muxtower', `bearer.${token}`])
      } else {
        ws = new WebSocket(`${base}?${QUERY_TOKEN}=${encodeURIComponent(token)}`)
      }
    } catch {
      return null
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close()
        resolve(null)
      }, OPEN_TIMEOUT_MS)
      ws.onopen = () => {
        clearTimeout(timeout)
        resolve(ws)
      }
      ws.onclose = () => {
        clearTimeout(timeout)
        resolve(null)
      }
    })
  }

  private attach(ws: WebSocket, method: StreamAuth) {
    this.ws = ws
    this.retry = 0
    this.handlers.onAuth(method)
    this.handlers.onStatus('open')
    ws.onmessage = (event) => {
      try {
        this.handlers.onFrame(JSON.parse(String(event.data)) as ServerFrame)
      } catch {
        // A malformed frame is dropped; the next one carries the full state again.
      }
    }
    ws.onclose = () => {
      this.ws = null
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
