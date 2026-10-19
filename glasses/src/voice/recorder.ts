/** Holds the glasses microphone while the owner talks, cuts the stream into segments at pauses (for
 *  live text), and hands back the whole recording as WAV when it stops. */
import type { GlassesPort } from '@/platform/port'
import { Segmenter } from './segmenter'
import { pcmSeconds, pcmToWav } from './wav'

/** A recording stops by itself after this long. */
export const MAX_RECORDING_MS = 60_000

export interface Recording {
  wav: Uint8Array<ArrayBuffer>
  seconds: number
  /** The part after the last segment handed out while recording, if it holds speech. */
  rest: Uint8Array<ArrayBuffer> | null
}

export class Recorder {
  private readonly port: GlassesPort
  private chunks: Uint8Array[] = []
  private segmenter = new Segmenter()
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
    this.segmenter = new Segmenter()
    if (!(await this.port.startAudio())) return false
    this.recording = true
    this.limit = setTimeout(onLimit, MAX_RECORDING_MS)
    return true
  }

  /** Adds microphone PCM; returns the segments (as WAV) that a pause just completed. */
  feed(pcm: Uint8Array): Uint8Array<ArrayBuffer>[] {
    if (!this.recording) return []
    this.chunks.push(pcm)
    return this.segmenter.push(pcm).map((frames) => pcmToWav(frames))
  }

  /** The recording, or null if nothing was recorded. */
  async stop(): Promise<Recording | null> {
    if (!this.recording) return null
    this.recording = false
    if (this.limit) clearTimeout(this.limit)
    await this.port.stopAudio()
    if (!this.chunks.length) return null
    const rest = this.segmenter.flush()
    const bytes = this.chunks.reduce((n, c) => n + c.length, 0)
    return { wav: pcmToWav(this.chunks), seconds: pcmSeconds(bytes), rest: rest ? pcmToWav(rest) : null }
  }
}
