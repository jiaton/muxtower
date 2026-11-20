import type { StoreApi, UseBoundStore } from 'zustand'
import { useLiveAudio } from './audio-prefs'
import { holdMedia, reassertMedia, runMediaAction, setMediaKeeper } from './media'
import { errorFields, logMedia, logTo, startMediaLog, stopMediaLog } from './media-log'
import { useSpeech } from './speech'
import { useAudioStatus } from './status'

/**
 * While Live and Read aloud are both on, this page stays the phone's media, so a car's dash keeps its
 * buttons (play: Play the latest, pause: stop speaking, ⏭: Read all or Live's send, ⏮: play again) between
 * the things said, not only while the hub's voice plays.
 *
 * Chrome keeps a page's media session, and routes the buttons to it, only while a media element of the
 * page plays, and only one of five seconds or more (a shorter one is a passing sound, given no controls).
 * So a silent loop plays meanwhile: ten seconds of near-silence, made here (no asset), looped. Near-silent
 * by its samples (16-bit noise of ±1, some -90 dBFS: inaudible), not by volume 0 or muted, nor exact zeros,
 * which Chrome or Android may treat as not playing anything. The controls are held only once it plays
 * (its play() resolved), so Chrome has a playing session to give them to. It keeps playing
 * under the hub's voice (the same page's media; a gap would hand the controls back to the phone for a
 * moment), and stops, with the metadata and every handler, as soon as Live or Read aloud is off: the
 * car's own music and its controls come back.
 *
 * A pause of the loop that this page did not make (the car's or the phone's own, which may pause the
 * element instead of calling the 'pause' handler) is taken as the user's pause: what is said stops, and the
 * loop plays again so the controls stay. Any action finds it playing too (`setMediaKeeper`). All of it goes
 * to the media log (`media-log.ts`).
 */

const SILENCE_S = 10 // over Chrome's five seconds (`kMinimumDurationForContent`)
const RATE = 8000
const RESUMES = 5 // a loop paused unasked is played again at most this often…
const RESUME_WINDOW_MS = 30_000 // …in this long: past that, the system has it (a call), and it is left

/** A WAV of near-silence: 8 kHz mono 16-bit, `seconds` long, each sample -1, 0 or 1 (inaudible noise, not
 *  exact zeros). */
export function silentWav(seconds = SILENCE_S): Blob {
  const n = seconds * RATE
  const data = new DataView(new ArrayBuffer(44 + n * 2))
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  data.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true) // PCM
  data.setUint16(22, 1, true) // mono
  data.setUint32(24, RATE, true)
  data.setUint32(28, RATE * 2, true) // bytes a second
  data.setUint16(32, 2, true) // bytes a frame
  data.setUint16(34, 16, true)
  text(36, 'data')
  data.setUint32(40, n * 2, true)
  let seed = 1
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    data.setInt16(44 + i * 2, (seed >> 16) % 3 - 1, true)
  }
  return new Blob([data], { type: 'audio/wav' })
}

interface Loop {
  audio: HTMLAudioElement
  url: string
  /** Its first play(): held only once it resolves (or is refused). */
  state: 'starting' | 'playing' | 'blocked'
  /** A pause this page makes (letting go): not the user's. */
  ours: boolean
  resumes: number[]
}
let loop: Loop | null = null

/** The loop as the log keeps it. */
function snapshot(audio: HTMLAudioElement) {
  return {
    paused: audio.paused,
    readyState: audio.readyState,
    volume: audio.volume,
    muted: audio.muted,
    currentTime: audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : null,
  }
}

const EVENTS = ['play', 'playing', 'pause', 'ended', 'stalled', 'suspend', 'waiting', 'error', 'volumechange'] as const

function startLoop() {
  if (loop) return
  const url = URL.createObjectURL(silentWav())
  const audio = new Audio(url)
  audio.loop = true
  const mine: Loop = { audio, url, state: 'starting', ours: false, resumes: [] }
  loop = mine
  for (const ev of EVENTS) audio.addEventListener(ev, () => onLoopEvent(mine, ev))
  useAudioStatus.setState({ loop: 'playing' })
  logMedia('loop-start', snapshot(audio))
  // Turned on by a tap (Live, Read aloud), so the browser lets it play; if it does not, the controls show
  // only while the hub's voice plays, as before.
  audio.play().then(
    () => {
      if (loop !== mine) return
      mine.state = 'playing'
      logMedia('loop-played', snapshot(audio))
      syncCarMedia()
    },
    (error: unknown) => {
      if (loop !== mine) return
      mine.state = 'blocked'
      useAudioStatus.setState({ loop: 'blocked' })
      logMedia('loop-blocked', { ...errorFields(error), ...snapshot(audio) })
      syncCarMedia()
    },
  )
}

function onLoopEvent(of: Loop, ev: (typeof EVENTS)[number]) {
  if (loop !== of) return
  logMedia('loop', { ev, ...snapshot(of.audio) })
  if (ev === 'pause' && !of.ours) pausedUnasked(of)
}

/** The loop paused, not by this page: the car's or the phone's pause, taken as the user's (what is said
 *  stops), then the loop played again so the controls stay. */
function pausedUnasked(of: Loop) {
  logMedia('loop-paused-unasked', snapshot(of.audio))
  runMediaAction('stop', 'loop paused')
  setTimeout(() => keepLoop('paused unasked'), 300)
}

/** Plays the loop again if something paused it (each action calls this first); logged. */
function keepLoop(why: string) {
  const of = loop
  if (!of || of.ours || !of.audio.paused) return
  const now = Date.now()
  of.resumes = of.resumes.filter((t) => now - t < RESUME_WINDOW_MS)
  if (of.resumes.length >= RESUMES) {
    logMedia('loop-resume-given-up', { why, ...snapshot(of.audio) })
    return
  }
  of.resumes.push(now)
  logMedia('loop-resume', { why, ...snapshot(of.audio) })
  of.audio.play().then(
    () => {
      if (loop !== of) return
      logMedia('loop-resumed', { why, ...snapshot(of.audio) })
      useAudioStatus.setState({ loop: 'playing' })
      reassertMedia('loop resumed')
    },
    (error: unknown) => {
      if (loop !== of) return
      logMedia('loop-resume-failed', { why, ...errorFields(error), ...snapshot(of.audio) })
      useAudioStatus.setState({ loop: 'blocked' })
    },
  )
}

function stopLoop() {
  if (!loop) return
  const { audio, url } = loop
  loop.ours = true
  loop = null
  audio.pause()
  audio.removeAttribute('src')
  URL.revokeObjectURL(url)
  useAudioStatus.setState({ loop: 'off' })
  logMedia('loop-stop')
}

interface Wiring {
  /** Live's store: whether it is on. */
  live: UseBoundStore<StoreApi<{ phase: string }>>
  /** Live's send (armed while speech is heard, else the box): ⏭ when chosen. False: nothing to send to. */
  send: () => boolean
}

let wired: Wiring | null = null
let shown: string | null = null // what was last held: the same again is not told the phone again

/** Holds the media controls while Live and Read aloud are on; lets them go when either is off. */
export function syncCarMedia() {
  if (!wired) return
  const { phase } = wired.live.getState()
  const { readAloud, front } = useSpeech.getState()
  const on = readAloud && phase !== 'off' && phase !== 'error' && typeof navigator !== 'undefined' && 'mediaSession' in navigator
  if (!on) {
    stopLoop()
    setMediaKeeper(null)
    if (shown !== null) holdMedia(null)
    shown = null
    stopMediaLog()
    return
  }
  startMediaLog(front?.daemonId ?? null)
  logTo(front?.daemonId ?? null)
  setMediaKeeper(keepLoop)
  startLoop()
  if (loop?.state === 'starting') return // held once it plays
  const title = ['muxtower', front?.name, 'listening'].filter(Boolean).join(' · ')
  const { nextTrack } = useLiveAudio.getState()
  const now = `${title}|${nextTrack}`
  if (now === shown) return
  shown = now
  const send = wired.send
  holdMedia({ title, next: nextTrack === 'send' ? () => (send() ? 'sent' : 'not sent: no page in front') : undefined })
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
