/** The one `/v1/stream` socket: authenticates with the WebSocket subprotocol (the token never goes into
 *  the URL), re-sends subscriptions after every reconnect, and backs off while the hub is unreachable. */
import type { HubConfig } from './config'
import type { ServerFrame, StreamSubscribe } from './types'

export type LinkState = 'connecting' | 'open' | 'down' | 'rejected'

const CLOSE_BAD_TOKEN = 4401
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

export interface StreamHandlers {
  frame(frame: ServerFrame): void
  state(state: LinkState): void
}

export function streamUrl(config: HubConfig): string {
  const url = new URL('/v1/stream', config.url)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  for (const [name, value] of Object.entries(config.gate.query)) url.searchParams.set(name, value)
  return url.toString()
}

export class HubStream {
  private ws: WebSocket | null = null
  private retryMs = RETRY_MIN_MS
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private readonly subscriptions = new Map<string, StreamSubscribe>()

  private readonly config: HubConfig
  private readonly token: string
  private readonly handlers: StreamHandlers

  constructor(config: HubConfig, token: string, handlers: StreamHandlers) {
    this.config = config
    this.token = token
    this.handlers = handlers
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
  }

  /** Reconnects now (the app came back to the foreground, or the owner asked to refresh). */
  kick() {
    if (this.stopped) return
    if (this.ws?.readyState === WebSocket.OPEN) return
    if (this.timer) clearTimeout(this.timer)
    this.retryMs = RETRY_MIN_MS
    this.connect()
  }

  subscribe(message: StreamSubscribe) {
    const key = `${message.topic}:${message.session_id ?? ''}`
    if (message.type === 'subscribe') this.subscriptions.set(key, message)
    else this.subscriptions.delete(key)
    this.send(message)
  }

  private send(message: StreamSubscribe) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  private connect() {
    this.ws?.close()
    this.handlers.state('connecting')
    const ws = new WebSocket(streamUrl(this.config), ['muxtower', `bearer.${this.token}`])
    this.ws = ws
    ws.onopen = () => {
      this.retryMs = RETRY_MIN_MS
      this.handlers.state('open')
      this.subscriptions.forEach((m) => this.send(m))
    }
    ws.onmessage = (event) => {
      try {
        this.handlers.frame(JSON.parse(String(event.data)) as ServerFrame)
      } catch {
        // Not a frame we understand; ignore it.
      }
    }
    ws.onclose = (event) => {
      if (this.ws !== ws || this.stopped) return
      if (event.code === CLOSE_BAD_TOKEN) {
        this.handlers.state('rejected')
        return
      }
      this.handlers.state('down')
      this.timer = setTimeout(() => this.connect(), this.retryMs)
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS)
    }
  }
}
