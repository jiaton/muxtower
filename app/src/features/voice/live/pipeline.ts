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

/** What became of something heard: a command done (or with nothing to do), words written, or why nothing was. */
export type Heard =
  | { kind: 'command'; command: Command; done: boolean; how: 'on device' | 'transcribed' }
  | { kind: 'text'; text: string; short: boolean }
  | { kind: 'ignored'; why: 'too short' | 'too quiet' | 'no session' | 'paused' | 'nothing said' | 'failed' }

export const SHORT_MS = 1500 // a segment this short may be a command on its own

export interface Segment {
  target: Target | null
  audio: Blob
  ms: number
  /** The same audio as samples (16 kHz mono), for the keyword spotter: a short segment only. */
  pcm?: Float32Array
}

/** How to transcribe: a short segment as a possible command (`hint: 'command'`), in a given language. */
export interface Ask {
  hint?: 'command'
  language?: string
}

interface Deps {
  /** The text, and the language it was taken as (null: detected), as the daemon says. */
  transcribe: (target: Target, audio: Blob, ask: Ask) => Promise<{ text: string; language: string | null }>
  ops: () => BoxOps
  cue: (cue: Cue) => void
  /** The keyword spotter, on the device: the command a short segment surely is, null when it is not sure,
   *  undefined when it is not loaded. */
  spot?: (pcm: Float32Array) => Promise<Command | null | undefined>
  /** Something the owner should see changed (state, pending count, an error). */
  changed?: () => void
  /** What became of the last thing heard (`feedbackOf` says it in a few words). */
  heard?: (event: Heard) => void
  count?: (what: 'segment' | 'uploaded' | 'dropped' | 'command' | 'spotted') => void
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
    const short = segment.ms <= SHORT_MS
    const spot = short && segment.pcm && this.deps.spot ? () => this.deps.spot!(segment.pcm!) : null
    if (this.state === 'paused') {
      // Paused: nothing is uploaded. Only the spotter listens, and only for "resume".
      this.deps.count?.('dropped')
      if (!spot) {
        this.deps.heard?.({ kind: 'ignored', why: 'paused' })
        return this.applied
      }
      return spot().then((command) => {
        if (command === 'resume') {
          this.deps.heard?.({ kind: 'command', command: 'resume', done: true, how: 'on device' })
          this.resume()
        } else this.deps.heard?.({ kind: 'ignored', why: 'paused' })
      })
    }
    if (!target) {
      this.deps.count?.('dropped')
      this.deps.heard?.({ kind: 'ignored', why: 'no session' })
      return this.applied
    }
    this.pending += 1
    this.deps.changed?.()
    const upload = this.gate.then(async (): Promise<{ command: Command } | { text: string } | null> => {
      if (this.state === 'paused') return null // paused meanwhile, by a command spoken before it
      // Rule 1: a short segment the spotter is sure of is that command, and is not uploaded.
      const spotted = spot ? await spot().catch(() => undefined) : undefined
      if (spotted) {
        this.deps.count?.('spotted')
        return { command: spotted }
      }
      this.deps.count?.('uploaded')
      const heard = short ? this.short(target, segment.audio) : this.long(target, segment.audio)
      return heard.then(
        (text) => ({ text }),
        (error: unknown) => {
          this.error = error instanceof Error ? error.message : String(error)
          this.deps.cue('error')
          this.deps.heard?.({ kind: 'ignored', why: 'failed' })
          return null
        },
      )
    })
    const landed = Promise.all([upload, this.applied]).then(([heard]) => {
      this.pending -= 1
      if (heard && 'command' in heard) this.act(heard.command, target, 'on device')
      else if (heard) this.land(target, segment.ms, heard.text)
      this.deps.changed?.()
    })
    this.applied = landed
    if (segment.ms <= SHORT_MS) this.gate = landed
    return landed
  }

  private async long(target: Target, audio: Blob): Promise<string> {
    return (await this.deps.transcribe(target, audio, {})).text
  }

  /** A short segment may be a command: transcribed with the command words as its prompt (and the daemon's
   *  configured language), so a one-word clip is less often heard as something else. */
  private async short(target: Target, audio: Blob): Promise<string> {
    return (await this.deps.transcribe(target, audio, { hint: 'command' })).text
  }

  private land(target: Target, ms: number, text: string) {
    if (!text.trim()) return this.deps.heard?.({ kind: 'ignored', why: 'nothing said' })
    const command = ms <= SHORT_MS ? commandIn(text) : null
    if (command) return this.act(command, target, 'transcribed')
    const sending = ms > SHORT_MS ? trailingSend(text) : null
    if (sending !== null) {
      this.deps.ops().append(target, sending)
      return this.act('send', target, 'transcribed')
    }
    this.error = null
    this.deps.ops().append(target, text.trim())
    this.deps.heard?.({ kind: 'text', text: text.trim(), short: ms <= SHORT_MS })
  }

  private act(command: Command, target: Target, how: 'on device' | 'transcribed') {
    this.deps.count?.('command')
    const ops = this.deps.ops()
    const done = (ok: boolean) => this.deps.heard?.({ kind: 'command', command, done: ok, how })
    switch (command) {
      case 'send': {
        const sent = ops.send(target) === 'sent'
        done(sent)
        return this.deps.cue(sent ? 'sent' : 'empty')
      }
      case 'pause':
        done(true)
        return this.pause()
      case 'resume':
        done(true)
        return this.resume()
      case 'clear':
        ops.clear(target)
        done(true)
        return this.deps.cue('cleared')
      case 'undo': {
        const undone = ops.undo(target)
        done(undone)
        return this.deps.cue(undone ? 'undone' : 'empty')
      }
    }
  }
}
