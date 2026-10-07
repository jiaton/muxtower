import type { Daemon, StreamAuth } from '@/lib/daemons/types'
import type { ServerFrame, StreamSubscribe } from './types'

export type StreamStatus = 'connecting' | 'open' | 'offline'

interface Handlers {
  onFrame: (frame: ServerFrame) => void
  onStatus: (status: StreamStatus) => void
  onAuth: (method: StreamAuth) => void
}

const ORDER: StreamAuth[] = ['cookie', 'subprotocol', 'query']
const OPEN_TIMEOUT_MS = 8000
const MAX_BACKOFF_MS = 15000

const keyOf = (m: StreamSubscribe) => (m.topic === 'screen' ? `screen:${m.session_id}` : m.topic)

/**
 * One /v1/stream socket for one daemon. Auth is tried in order of safety: an HttpOnly cookie (only when
 * the app is served from the daemon itself), the token as a WebSocket subprotocol (not in the URL), and
 * last the token as a query parameter (for proxies that only forward query tokens). The method that
 * worked is reported through onAuth so it is tried first next time.
 */
export class DaemonStream {
  private ws: WebSocket | null = null
  private readonly subs = new Map<string, { message: StreamSubscribe; refs: number }>()
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
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

  private async connect() {
    this.handlers.onStatus('connecting')
    for (const method of this.methods()) {
      if (this.stopped) return
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
        if (!res.ok) return null
        ws = new WebSocket(base, ['muxtower'])
      } else if (method === 'subprotocol') {
        ws = new WebSocket(base, ['muxtower', `bearer.${token}`])
      } else {
        ws = new WebSocket(`${base}?token=${encodeURIComponent(token)}`)
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
