/** A voice reply from start to finish: the microphone (held, or from a tap to the next tap), live text
 *  from the segments a pause completes, then the final text, which the owner confirms before it is sent.
 *  The final text always comes from one pass over the whole recording (at most MAX_RECORDING_MS), so
 *  where the segments were cut only ever affects the live preview. */
import { current, conciergeOf, type Voice } from '@/state/model'
import type { AppStore } from '@/state/store'
import type { Recorder } from './recorder'
import { joinText } from './segmenter'

export interface TalkDeps {
  store: AppStore
  recorder: Recorder
  transcribe(wav: Uint8Array<ArrayBuffer>): Promise<string>
  notify(text: string): void
}

export class Talk {
  private readonly deps: TalkDeps
  /** Increases with every recording: results that arrive for an older one are dropped. */
  private take = 0
  /** Live segments are transcribed one after another, so their text arrives in order. */
  private pieces: Promise<void> = Promise.resolve()

  constructor(deps: TalkDeps) {
    this.deps = deps
  }

  private get voice() {
    return this.deps.store.getState().voice
  }

  private set(voice: Voice | null) {
    this.deps.store.setState({ voice })
  }

  /** In a session, talk to it; anywhere else, to the assistant (if the hub runs one). */
  async start(mode: Voice['mode']) {
    const { store, recorder, notify } = this.deps
    const state = store.getState()
    const place = current(state.nav)
    const target = state.voice?.session ?? (place.screen === 'session' ? place.id : conciergeOf(state)?.id)
    if (!target) return notify('Open a session to reply')
    if (!state.features.asr) return notify('Voice is off on the hub')
    if (recorder.active || state.voice?.phase === 'transcribing') return
    const take = ++this.take
    if (!(await recorder.start(() => void this.stop()))) return notify('No microphone')
    this.pieces = Promise.resolve()
    if (take === this.take) this.set({ session: target, mode, phase: 'listening', text: '' })
  }

  /** Microphone PCM while listening: completed segments are transcribed and their text appended. */
  feed(pcm: Uint8Array) {
    const take = this.take
    for (const segment of this.deps.recorder.feed(pcm)) {
      this.pieces = this.pieces.then(async () => {
        const text = await this.deps.transcribe(segment).catch(() => '')
        const voice = this.voice
        if (take === this.take && voice?.phase === 'listening' && text.trim())
          this.set({ ...voice, text: joinText(voice.text, text.trim()) })
      })
    }
  }

  async stop() {
    const voice = this.voice
    const take = this.take
    const recording = await this.deps.recorder.stop()
    if (!voice || voice.phase !== 'listening') return
    if (!recording) return this.set({ ...voice, phase: 'failed', text: 'Nothing was heard.' })
    this.set({ ...voice, phase: 'transcribing' })
    try {
      const text = (await this.deps.transcribe(recording.wav)).trim()
      if (take !== this.take || !this.voice) return
      this.set(text ? { ...voice, phase: 'ready', text } : { ...voice, phase: 'failed', text: 'Nothing was heard.' })
    } catch (error) {
      if (take !== this.take || !this.voice) return
      this.set({ ...voice, phase: 'failed', text: error instanceof Error ? error.message : 'Speech to text failed' })
    }
  }

  /** The reply was cancelled: let go of the microphone and ignore what is still on its way. */
  async cancel() {
    this.take++
    await this.deps.recorder.stop()
  }
}
