import { commandIn, SPEECH_COMMANDS, trailingSend, type Command, type SpeechCommand } from './commands'

/** How a command came: heard on the device, read off a transcript, or keyed (⌘↵). */
export type How = 'on device' | 'transcribed' | 'key'

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
  | { kind: 'command'; command: Command; done: boolean; how: How }
  | { kind: 'text'; text: string; short: boolean }
  | { kind: 'ignored'; why: 'too short' | 'too quiet' | 'no session' | 'paused' | 'nothing said' | 'failed' | 'speaking' }

export const SHORT_MS = 1500 // a segment this short may be a command on its own

export interface Segment {
  target: Target | null
  audio: Blob
  ms: number
  /** The same audio as samples (16 kHz mono), for the keyword spotter: a short segment only. */
  pcm?: Float32Array
  /** When it was heard, from and to (ms since the epoch): a segment overlapping Read aloud's speaking is dropped. */
  heardFrom?: number
  heardTo?: number
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
  /** The VAD hears speech now (a segment not yet cut): ⌘↵ waits for it. */
  hearing?: () => boolean
  /** Read aloud is speaking, or just was (its tail): nothing is heard at all meanwhile. */
  speaking?: () => boolean
  /** Whether what was heard between these times overlapped its speaking (or tail): then it is dropped. */
  overlapsSpeech?: (from: number, to: number) => boolean
  /** Read aloud's commands: stop, say again, read all. Whether there was anything to do. */
  speech?: (command: SpeechCommand) => boolean
}

/**
 * Live mode's segments, in the order they were spoken. Listening, each is transcribed (uploads run
 * side by side) and what it says lands in order: a short one that is only a command acts (send, pause,
 * clear, undo); a long one ending in "send" is appended, then sent; anything else is text. Paused,
 * nothing is uploaded at all: segments are dropped, and only `resume` (a tap, a key) listens again.
 *
 * A short segment may be "pause", so the segments after it are not uploaded until it is known not to be:
 * nothing said after "pause" leaves the device. Long ones hold nothing up.
 */
export class LivePipeline {
  state: 'listening' | 'paused' = 'listening'
  pending = 0
  /** A command heard on its own that waits for the words said before it to land (then done). */
  then: Command | null = null
  /** ⌘↵ pressed while still speaking: sent when that speech has ended and landed (`heardEnd`). */
  private armed: { command: Command; target: Target } | null = null
  private sends = 0 // sends so far: an armed send that another (a spoken "send") beat to it is none
  error: string | null = null
  private applied: Promise<void> = Promise.resolve() // the last segment's result, landed
  private gate: Promise<void> = Promise.resolve() // what a new upload waits for: the short ones before it

  private readonly deps: Deps

  constructor(deps: Deps) {
    this.deps = deps
  }

  pause() {
    this.disarm() // a send waiting for the speech is let go too
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
    // Read aloud speaking, or just done, or this was heard (even partly) while it spoke: its own voice,
    // echoed. Dropped whole: never uploaded, never a command.
    const to = segment.heardTo ?? Date.now()
    const from = segment.heardFrom ?? to - segment.ms
    if (this.deps.speaking?.() || this.deps.overlapsSpeech?.(from, to)) {
      this.deps.count?.('dropped')
      this.deps.heard?.({ kind: 'ignored', why: 'speaking' })
      return this.applied
    }
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

  /**
   * A command the keyword spotter heard said on its own, as soon as its speaker paused (before the segment's
   * end): done once what was said before it has landed, nothing uploaded. Paused, only "resume" is heard.
   */
  spotted(command: Command, target: Target | null): Promise<void> {
    this.deps.count?.('segment')
    this.deps.count?.('spotted')
    if (this.deps.speaking?.()) {
      this.deps.heard?.({ kind: 'ignored', why: 'speaking' }) // nothing is heard while it speaks
      return this.applied
    }
    if (SPEECH_COMMANDS.includes(command)) {
      // Read aloud's (it is not speaking now): at once, nothing to wait for.
      this.act(command, target ?? { daemonId: '', sessionId: '' }, 'on device')
      return this.applied
    }
    if (this.state === 'paused' && command !== 'resume') {
      this.deps.heard?.({ kind: 'ignored', why: 'paused' })
      return this.applied
    }
    if (!target && command !== 'pause' && command !== 'resume') {
      this.deps.heard?.({ kind: 'ignored', why: 'no session' })
      return this.applied
    }
    const waits = this.pending > 0
    if (waits) {
      this.then = command
      this.deps.changed?.()
    }
    const landed = this.applied.then(() => {
      if (this.then === command) this.then = null
      this.act(command, target ?? { daemonId: '', sessionId: '' }, 'on device')
      this.deps.changed?.()
    })
    this.applied = landed
    this.gate = landed
    return landed
  }

  /** "send" from the keyboard (⌘↵): the spoken one's path, done once what was said before has landed.
   *  Paused (commands only) too: what is in the box is the owner's to send. Pressed while still speaking:
   *  armed, it waits for that speech to end and land (`heardEnd`), then sends, once (pressed again meanwhile:
   *  nothing more; `disarm` lets it go). */
  keyed(command: Command, target: Target): Promise<void> {
    if (this.armed) return this.applied // armed already: one send
    if (this.deps.hearing?.()) {
      this.armed = { command, target }
      this.then = command
      this.deps.changed?.()
      return this.applied
    }
    if (this.pending > 0) {
      this.then = command
      this.deps.changed?.()
    }
    const landed = this.applied.then(() => {
      if (this.then === command) this.then = null
      this.act(command, target, 'key')
      this.deps.changed?.()
    })
    this.applied = landed
    this.gate = landed
    return landed
  }

  /** The speech being heard when ⌘↵ was pressed has ended (handed on as segments, or dropped as too short,
   *  too quiet, not speech): the armed send goes once what it said has landed, or at once if nothing came. */
  heardEnd() {
    const armed = this.armed
    if (!armed) return
    this.armed = null
    const sends = this.sends
    const landed = this.applied.then(() => {
      if (this.then === armed.command) this.then = null
      if (this.sends === sends) this.act(armed.command, armed.target, 'key') // else what was said sent it already
      this.deps.changed?.()
    })
    this.applied = landed
    this.gate = landed
  }

  /** An armed send let go (Esc, pause, Live off): nothing is sent. */
  disarm(): boolean {
    if (!this.armed) return false
    if (this.then === this.armed.command) this.then = null
    this.armed = null
    this.deps.changed?.()
    return true
  }

  /** Whether a ⌘↵ waits for the speech being heard. */
  get waitingToSend(): boolean {
    return this.armed !== null
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
    // A long segment that is only "send" (a pause or a breath around the word stretched it past SHORT_MS):
    // still the command, never the word typed after what came before.
    if (ms > SHORT_MS && commandIn(text) === 'send') return this.act('send', target, 'transcribed')
    this.error = null
    this.deps.ops().append(target, text.trim())
    this.deps.heard?.({ kind: 'text', text: text.trim(), short: ms <= SHORT_MS })
  }

  private act(command: Command, target: Target, how: How) {
    this.deps.count?.('command')
    const ops = this.deps.ops()
    const done = (ok: boolean) => this.deps.heard?.({ kind: 'command', command, done: ok, how })
    switch (command) {
      case 'send': {
        if (how !== 'key') this.disarm() // a spoken "send" while ⌘↵ waits: the same send, once
        this.sends += 1
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
      case 'stop':
      case 'repeat':
      case 'read':
        return done(this.deps.speech?.(command) ?? false)
    }
  }
}
