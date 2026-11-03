import type { ServerFrame, StreamPing, StreamSubscribe } from '@/lib/api/types'
import type { World } from './world'

/**
 * The demo daemon's `/v1/stream`: as much of a WebSocket as `lib/api/stream.ts` uses. It sends what the
 * reader subscribed to (the session list, a screen, a conversation) on subscribing and on every change.
 */
export class DemoSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = DemoSocket.CONNECTING
  protocol = 'muxtower'
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private readonly topics = new Set<string>()
  private readonly world: World
  private readonly stop: () => void

  constructor(world: World) {
    this.world = world
    this.stop = world.listen((frame) => {
      if (this.wants(frame)) this.deliver(frame)
    })
    setTimeout(() => {
      if (this.readyState !== DemoSocket.CONNECTING) return
      this.readyState = DemoSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send(raw: string) {
    const message = JSON.parse(raw) as StreamSubscribe | StreamPing
    if (message.type === 'ping') {
      this.deliver({ type: 'pong' })
      return
    }
    const key = message.topic === 'sessions' ? 'sessions' : `${message.topic}:${message.session_id}`
    if (message.type === 'unsubscribe') {
      this.topics.delete(key)
      return
    }
    this.topics.add(key)
    const id = message.session_id ?? ''
    if (message.topic === 'sessions') this.deliver({ type: 'sessions', sessions: this.world.sessions() })
    else if (message.topic === 'screen') this.deliver({ type: 'screen', session_id: id, ansi: this.world.screen(id) ?? '' })
    else this.deliver({ type: 'conversation', session_id: id, items: this.world.items(id) })
  }

  close() {
    if (this.readyState === DemoSocket.CLOSED) return
    this.readyState = DemoSocket.CLOSED
    this.stop()
    this.onclose?.(new CloseEvent('close', { code: 1000 }))
  }

  private wants(frame: ServerFrame) {
    if (frame.type === 'sessions') return this.topics.has('sessions')
    if (frame.type === 'screen' || frame.type === 'conversation') return this.topics.has(`${frame.type}:${frame.session_id}`)
    return true
  }

  private deliver(frame: ServerFrame) {
    // A real socket never answers inside send(): neither does this one.
    setTimeout(() => {
      if (this.readyState === DemoSocket.OPEN) this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }))
    }, 0)
  }
}
