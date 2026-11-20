import type { StoreApi, UseBoundStore } from 'zustand'
import { useLiveAudio } from './audio-prefs'
import { holdMedia } from './media'
import { useSpeech } from './speech'
import { useAudioStatus } from './status'

/**
 * While Live and Read aloud are both on, this page stays the phone's media, so a car's dash keeps its
 * buttons (play: Play the latest, pause: stop speaking, ⏭: Read all or Live's send, ⏮: play again) between
 * the things said, not only while the hub's voice plays.
 *
 * Chrome keeps a page's media session, and routes the buttons to it, only while a media element of the
 * page plays, and only one of five seconds or more (a shorter one is a passing sound, given no controls).
 * So a silent loop plays meanwhile: ten seconds of silence, made here (no asset), looped. Silent by its
 * samples, not by volume 0 or muted, which Chrome may treat as not playing anything. It keeps playing
 * under the hub's voice (the same page's media; a gap would hand the controls back to the phone for a
 * moment), and stops, with the metadata and every handler, as soon as Live or Read aloud is off: the
 * car's own music and its controls come back.
 */

const SILENCE_S = 10 // over Chrome's five seconds (`kMinimumDurationForContent`)
const RATE = 8000

/** A WAV of silence: 8 kHz mono 8-bit (128 is silence there), `seconds` long. */
export function silentWav(seconds = SILENCE_S): Blob {
  const n = seconds * RATE
  const data = new DataView(new ArrayBuffer(44 + n))
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  data.setUint32(4, 36 + n, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true) // PCM
  data.setUint16(22, 1, true) // mono
  data.setUint32(24, RATE, true)
  data.setUint32(28, RATE, true)
  data.setUint16(32, 1, true)
  data.setUint16(34, 8, true)
  text(36, 'data')
  data.setUint32(40, n, true)
  for (let i = 0; i < n; i++) data.setUint8(44 + i, 128)
  return new Blob([data], { type: 'audio/wav' })
}

let loop: { audio: HTMLAudioElement; url: string } | null = null

function startLoop() {
  if (loop) return
  const url = URL.createObjectURL(silentWav())
  const audio = new Audio(url)
  audio.loop = true
  loop = { audio, url }
  useAudioStatus.setState({ loop: 'playing' })
  // Turned on by a tap (Live, Read aloud), so the browser lets it play; if it does not, the controls show
  // only while the hub's voice plays, as before.
  audio.play().catch(() => {
    if (loop?.audio === audio) useAudioStatus.setState({ loop: 'blocked' })
  })
}

function stopLoop() {
  if (!loop) return
  loop.audio.pause()
  loop.audio.removeAttribute('src')
  URL.revokeObjectURL(loop.url)
  loop = null
  useAudioStatus.setState({ loop: 'off' })
}

interface Wiring {
  /** Live's store: whether it is on. */
  live: UseBoundStore<StoreApi<{ phase: string }>>
  /** Live's send (armed while speech is heard, else the box): ⏭ when chosen. */
  send: () => void
}

let wired: Wiring | null = null
let shown: string | null = null // what was last held: the same again is not told the phone again

/** Holds the media controls while Live and Read aloud are on; lets them go when either is off. */
export function syncCarMedia() {
  if (!wired) return
  const { phase } = wired.live.getState()
  const { readAloud, speaking, front } = useSpeech.getState()
  const on = readAloud && phase !== 'off' && phase !== 'error' && typeof navigator !== 'undefined' && 'mediaSession' in navigator
  if (!on) {
    stopLoop()
    if (shown !== null) holdMedia(null)
    shown = null
    return
  }
  startLoop()
  const title = ['muxtower', front?.name, 'listening'].filter(Boolean).join(' · ')
  const { nextTrack } = useLiveAudio.getState()
  const now = `${title}|${speaking}|${nextTrack}`
  if (now === shown) return
  shown = now
  holdMedia({ title, playing: speaking, next: nextTrack === 'send' ? wired.send : undefined })
}

/** Called once by `engine.ts` (which owns Live): follows Live, Read aloud and the ⏭ setting from then on. */
export function wireCarMedia(wiring: Wiring) {
  if (wired) return
  wired = wiring
  wiring.live.subscribe(syncCarMedia)
  useSpeech.subscribe(syncCarMedia)
  useLiveAudio.subscribe(syncCarMedia)
  syncCarMedia()
}
