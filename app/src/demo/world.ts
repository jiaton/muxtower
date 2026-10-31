import type { ConversationItem, PendingAction, ServerFrame, Session } from '@/lib/api/types'

/** One moment of a scripted story: after `after` ms, the session changes, the screen gains lines (and a
 *  new footer: the prompt box, a dialog, a spinner) and the conversation gains or updates items. */
export interface Step {
  after: number
  session?: Partial<Session>
  add?: string[]
  footer?: string[]
  items?: ConversationItem[]
}

/** A simulated session: what it starts as, and how it answers what the reader does. */
export interface Scene {
  session: Session
  history: string[]
  footer: string[]
  items: ConversationItem[]
  /** Played as soon as the demo opens: an agent already at work. */
  start?: Step[]
  approve?: (option: string) => Step[]
  deny?: () => Step[]
  reply?: (text: string) => Step[]
}

type Listener = (frame: ServerFrame) => void
type Schedule = (run: () => void, ms: number) => void

const ATTENTION = new Set(['needs_permission', 'needs_answer', 'needs_trust', 'plan_review', 'error'])
const SCREEN_LINES = 80

/**
 * The demo daemon's state: the sessions, their screens and conversations. Changes go out as the same
 * frames a daemon's `/v1/stream` sends; HTTP reads (`server.ts`) see the same state.
 */
export class World {
  private readonly scenes = new Map<string, Scene>()
  private readonly listeners = new Set<Listener>()
  private readonly schedule: Schedule

  constructor(scenes: Scene[], schedule: Schedule = (run, ms) => void setTimeout(run, ms)) {
    for (const scene of scenes) {
      const { session, history, footer, items } = scene
      this.scenes.set(session.id, { ...scene, session: { ...session }, history: [...history], footer: [...footer], items: [...items] })
    }
    this.schedule = schedule
    for (const scene of scenes) if (scene.start) this.play(scene.session.id, scene.start)
  }

  sessions(): Session[] {
    return [...this.scenes.values()].map((s) => s.session)
  }

  session(id: string): Session | undefined {
    return this.scenes.get(id)?.session
  }

  screen(id: string): string | null {
    const scene = this.scenes.get(id)
    if (!scene?.session.capabilities.screen) return null
    return [...scene.history, '', ...scene.footer].slice(-SCREEN_LINES).join('\n')
  }

  items(id: string): ConversationItem[] {
    return this.scenes.get(id)?.items ?? []
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Picks an option of what the session asks (default: the recommended one); null when it asks nothing. */
  approve(id: string, option: string | null): { option: string; pending: PendingAction } | null {
    const scene = this.scenes.get(id)
    const pending = scene?.session.pending
    if (!scene || !pending) return null
    const picked = option ?? pending.recommended ?? pending.options?.[0]?.key ?? '1'
    this.play(id, scene.approve?.(picked) ?? [])
    return { option: picked, pending }
  }

  deny(id: string): PendingAction | null {
    const scene = this.scenes.get(id)
    const pending = scene?.session.pending
    if (!scene || !pending) return null
    this.play(id, scene.deny?.() ?? [{ after: 0, session: { state: 'idle', pending: null } }])
    return pending
  }

  /** Text sent with Enter is a message to the agent; keys and unsent text change nothing here. */
  input(id: string, text: string | null, enter: boolean) {
    const scene = this.scenes.get(id)
    if (scene && text?.trim() && enter) this.play(id, scene.reply?.(text.trim()) ?? [])
  }

  /** Marks set by the reader (read, hidden, pinned, archived, renamed). */
  mark(id: string, patch: Partial<Session>) {
    if (!this.scenes.has(id)) return false
    this.apply(id, { after: 0, session: patch }, false)
    return true
  }

  remove(id: string) {
    if (!this.scenes.delete(id)) return false
    this.emit({ type: 'sessions', sessions: this.sessions() })
    return true
  }

  private play(id: string, steps: Step[]) {
    let at = 0
    for (const step of steps) {
      at += step.after
      // What happens at once (the request answered, the dialog gone) is there before the reply.
      if (at === 0) this.apply(id, step)
      else this.schedule(() => this.apply(id, step), at)
    }
  }

  private apply(id: string, step: Step, touched = true) {
    const scene = this.scenes.get(id)
    if (!scene) return
    if (step.session) {
      const session = { ...scene.session, ...step.session }
      session.needs_attention = ATTENTION.has(session.state)
      if (touched) session.updated_at = new Date().toISOString()
      scene.session = session
      this.emit({ type: 'sessions', sessions: this.sessions() })
    }
    if (step.add || step.footer) {
      scene.history.push(...(step.add ?? []))
      if (step.footer) scene.footer = step.footer
      this.emit({ type: 'screen', session_id: id, ansi: this.screen(id) ?? '' })
    }
    if (step.items?.length) {
      const bySeq = new Map(scene.items.map((item) => [item.seq, item]))
      for (const item of step.items) bySeq.set(item.seq, item)
      scene.items = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
      this.emit({ type: 'conversation', session_id: id, items: step.items })
    }
  }

  private emit(frame: ServerFrame) {
    for (const listener of this.listeners) listener(frame)
  }
}
