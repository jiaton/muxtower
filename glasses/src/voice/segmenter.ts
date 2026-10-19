/** Cuts a live recording into segments at pauses, so each can be transcribed while the owner is still
 *  speaking (no streaming recognizer needed, and every second of audio is sent once).
 *
 *  Works on 100 ms frames of 16 kHz mono s16le PCM: a frame is speech when its loudness (RMS) is above
 *  a threshold. A segment ends after a pause that follows enough speech, or when it gets too long; a
 *  segment that is all silence is dropped. */
import { SAMPLE_RATE } from './wav'

const FRAME_MS = 100
export const FRAME_BYTES = (SAMPLE_RATE * 2 * FRAME_MS) / 1000
const SPEECH_RMS = 600
const MIN_SPEECH_MS = 300 // less than this in a segment: silence, dropped
const MIN_SEGMENT_SPEECH_MS = 800 // before a pause may end a segment
const PAUSE_MS = 600
const MAX_SEGMENT_MS = 8000

function rms(frame: Uint8Array): number {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  let sum = 0
  const samples = frame.byteLength >> 1
  for (let i = 0; i < samples; i++) {
    const s = view.getInt16(i * 2, true)
    sum += s * s
  }
  return samples ? Math.sqrt(sum / samples) : 0
}

export class Segmenter {
  private carry = new Uint8Array(0)
  private frames: Uint8Array[] = []
  private speechMs = 0
  private quietMs = 0

  /** Adds PCM; returns the segments it completed (each a list of PCM frames). */
  push(pcm: Uint8Array): Uint8Array[][] {
    const data = new Uint8Array(this.carry.length + pcm.length)
    data.set(this.carry)
    data.set(pcm, this.carry.length)
    const done: Uint8Array[][] = []
    let at = 0
    for (; at + FRAME_BYTES <= data.length; at += FRAME_BYTES) {
      const frame = data.slice(at, at + FRAME_BYTES)
      this.frames.push(frame)
      if (rms(frame) >= SPEECH_RMS) {
        this.speechMs += FRAME_MS
        this.quietMs = 0
      } else {
        this.quietMs += FRAME_MS
      }
      const paused = this.speechMs >= MIN_SEGMENT_SPEECH_MS && this.quietMs >= PAUSE_MS
      if (paused || this.frames.length * FRAME_MS >= MAX_SEGMENT_MS) {
        const segment = this.take()
        if (segment) done.push(segment)
      }
    }
    this.carry = data.slice(at)
    return done
  }

  /** What is left when the recording stops (null if it is silence). */
  flush(): Uint8Array[] | null {
    if (this.carry.length) this.frames.push(this.carry)
    this.carry = new Uint8Array(0)
    return this.take()
  }

  private take(): Uint8Array[] | null {
    const frames = this.frames
    const speech = this.speechMs
    this.frames = []
    this.speechMs = 0
    this.quietMs = 0
    return speech >= MIN_SPEECH_MS ? frames : null
  }
}

/** Joins transcript pieces: a space between two Latin words, nothing next to Chinese. */
export function joinText(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return /[A-Za-z0-9.,!?]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : a + b
}
