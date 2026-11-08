import { commandIn, trailingSend, type Command } from './commands'

/** The session page a segment's speech started on: its words land there, wherever the owner is by then. */
export interface Target {
  daemonId: string
  sessionId: string
}

/** What a segment can do to a message box (given by the page, `setLiveOps`). */
export interface BoxOps {
  append: (target: Target, text: string) => void
  clear: (target: Target) => void
  /** Takes back the last segment appended there; false when there is none. */
  undo: (target: Target) => boolean
  /** Sends what the box holds, as Send does: 'empty' when there is nothing to send. */
  send: (target: Target) => 'sent' | 'empty'
}

export type Cue = 'sent' | 'paused' | 'resumed' | 'cleared' | 'undone' | 'empty' | 'error'

export const SHORT_MS = 1500 // a segment this short may be a command on its own

export interface Segment {
  target: Target | null
  audio: Blob
  ms: number
}

interface Deps {
  transcribe: (target: Target, audio: Blob) => Promise<string>
  ops: () => BoxOps
  cue: (cue: Cue) => void
  /** Something the owner should see changed (state, pending count, an error). */
  changed?: () => void
  count?: (what: 'segment' | 'uploaded' | 'dropped' | 'command') => void
}

/**
 * Live mode's segments, in the order they were spoken. Listening, each is transcribed (uploads run
 * side by side) and what it says lands in order: a short one that is only a command acts (send, pause,
 * clear, undo); a long one ending in "send" is appended, then sent; anything else is text. Paused,
 * nothing is uploaded at all: segments are dropped, and only `resume` (a tap, a key) listens again.
 *
 * A short segment may be "pause", so the segments after it are not uploaded until it is known not to be:
 * nothing said after "暂停" leaves the device. Long ones hold nothing up.
 */
export class LivePipeline {
  state: 'listening' | 'paused' = 'listening'
  pending = 0
  error: string | null = null
  private applied: Promise<void> = Promise.resolve() // the last segment's result, landed
  private gate: Promise<void> = Promise.resolve() // what a new upload waits for: the short ones before it

  private readonly deps: Deps

  constructor(deps: Deps) {
    this.deps = deps
  }

  pause() {
    if (this.state === 'paused') return
    this.state = 'paused'
    this.deps.cue('paused')
    this.deps.changed?.()
  }

  resume() {
    if (this.state === 'listening') return
    this.state = 'listening'
    this.deps.cue('resumed')
    this.deps.changed?.()
  }

  /** A segment the VAD cut (speech, long enough, loud enough). Resolves once its result has landed. */
  segment(segment: Segment): Promise<void> {
    this.deps.count?.('segment')
    const { target } = segment
    if (this.state === 'paused' || !target) {
      this.deps.count?.('dropped')
      return this.applied
    }
    this.pending += 1
    this.deps.changed?.()
    const upload = this.gate.then(() => {
      if (this.state === 'paused') return null // paused meanwhile, by a command spoken before it
      this.deps.count?.('uploaded')
      return this.deps.transcribe(target, segment.audio).catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error)
        this.deps.cue('error')
        return null
      })
    })
    const landed = Promise.all([upload, this.applied]).then(([text]) => {
      this.pending -= 1
      if (text !== null) this.land(target, segment.ms, text)
      this.deps.changed?.()
    })
    this.applied = landed
    if (segment.ms <= SHORT_MS) this.gate = landed
    return landed
  }

  private land(target: Target, ms: number, text: string) {
    if (!text.trim()) return
    const command = ms <= SHORT_MS ? commandIn(text) : null
    if (command) return this.act(command, target)
    const sending = ms > SHORT_MS ? trailingSend(text) : null
    if (sending !== null) {
      this.deps.ops().append(target, sending)
      return this.act('send', target)
    }
    this.error = null
    this.deps.ops().append(target, text.trim())
  }

  private act(command: Command, target: Target) {
    this.deps.count?.('command')
    const ops = this.deps.ops()
    switch (command) {
      case 'send':
        return this.deps.cue(ops.send(target) === 'sent' ? 'sent' : 'empty')
      case 'pause':
        return this.pause()
      case 'resume':
        return this.resume()
      case 'clear':
        ops.clear(target)
        return this.deps.cue('cleared')
      case 'undo':
        return this.deps.cue(ops.undo(target) ? 'undone' : 'empty')
    }
  }
}
