import type { ServerFrame, StreamPing, StreamSubscribe } from '@/lib/api/types'
import { speakLatest } from './spoken'
import type { World } from './world'

type SpokenFrame = Extract<ServerFrame, { type: 'spoken' }>

/**
 * The demo daemon's `/v1/stream`: as much of a WebSocket as `lib/api/stream.ts` uses. It sends what the
 * reader subscribed to (the session list, a screen, a conversation) on subscribing and on every change, and,
 * for a session it listens to (`spoken`: Live's Read aloud), a summary of each turn that ends from then on.
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
  /** Sessions listened to (`spoken`), each with the reply already heard: as the daemon, only later turns are said. */
  private readonly listened = new Map<string, string | null>()
  private readonly world: World
  private readonly stop: () => void

  private readonly latency: number

  constructor(world: World, latency = 0) {
    this.world = world
    this.latency = latency
    this.stop = world.listen((frame) => {
      if (this.wants(frame)) this.deliver(frame)
      if (frame.type === 'sessions') this.speakEnded()
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
    if (message.topic === 'spoken') {
      this.listen(message.type, message.session_id ?? '')
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

  /** Listening to a session (or no longer): from its next turn on, as `listen/service.py` does. */
  private listen(kind: 'subscribe' | 'unsubscribe', id: string) {
    if (kind === 'unsubscribe') this.listened.delete(id)
    else if (id && !this.listened.has(id)) this.listened.set(id, this.world.session(id)?.last_message ?? null)
  }

  /** A `spoken` frame for each listened session whose turn just ended with a reply not said yet, made by
   *  `spoken.ts` (and kept there, so Play says the same). */
  private speakEnded() {
    for (const [id, seen] of this.listened) {
      const session = this.world.session(id)
      const reply = session?.last_message ?? null
      if (!session || session.state === 'busy' || !reply || reply === seen) continue
      this.listened.set(id, reply)
      const said = speakLatest(this.world, id)
      if (!said) continue
      const frame: SpokenFrame = { type: 'spoken', session_id: id, text: said.text, reply: said.reply, language: said.language }
      this.deliver(frame)
    }
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
    }, this.latency)
  }
}
