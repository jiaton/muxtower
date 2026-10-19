/** Holds the glasses microphone while the owner holds the gesture, and hands back the recording as WAV. */
import type { GlassesPort } from '@/platform/port'
import { pcmToWav } from './wav'

/** A recording stops by itself after this long. */
export const MAX_RECORDING_MS = 60_000

export class Recorder {
  private readonly port: GlassesPort
  private chunks: Uint8Array[] = []
  private recording = false
  private limit: ReturnType<typeof setTimeout> | null = null

  constructor(port: GlassesPort) {
    this.port = port
  }

  get active() {
    return this.recording
  }

  async start(onLimit: () => void): Promise<boolean> {
    if (this.recording) return true
    this.chunks = []
    if (!(await this.port.startAudio())) return false
    this.recording = true
    this.limit = setTimeout(onLimit, MAX_RECORDING_MS)
    return true
  }

  feed(pcm: Uint8Array) {
    if (this.recording) this.chunks.push(pcm)
  }

  /** The recording as WAV, or null if nothing was recorded. */
  async stop(): Promise<Uint8Array<ArrayBuffer> | null> {
    if (!this.recording) return null
    this.recording = false
    if (this.limit) clearTimeout(this.limit)
    await this.port.stopAudio()
    return this.chunks.length ? pcmToWav(this.chunks) : null
  }
}
