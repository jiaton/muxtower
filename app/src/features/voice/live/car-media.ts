import type { StoreApi, UseBoundStore } from 'zustand'
import { useLiveAudio } from './audio-prefs'
import { holdMedia, reassertMedia, runMediaAction, setMediaKeeper } from './media'
import { errorFields, logMedia, logTo, startMediaLog, stopMediaLog } from './media-log'
import { phoneVoiceSpeaking, useSpeech } from './speech'
import { useAudioStatus } from './status'

/**
 * While Live and Read aloud are both on, this page stays the phone's media, so a car's dash keeps its
 * buttons (play: Play the latest, pause: stop speaking, ⏭: Read all or Live's send, ⏮: play again) between
 * the things said, not only while the hub's voice plays.
 *
 * Chrome keeps a page's media session, and routes the buttons to it, only while a media element of the
 * page plays, and only one of five seconds or more (a shorter one is a passing sound, given no controls).
 * So a near-silent loop plays meanwhile: ten seconds, made here (no asset), looped. Chromium gives a page a
 * media session only for an element that plays audibly: not muted, not volume 0, and its level above the
 * tab audio monitor's threshold (-72.25 dBFS, 2^-12 of full scale), which exact zeros or a 1–2 LSB dither
 * are not. So it is a 25 Hz tone at -60 dBFS (RMS): audible to Chrome's meter, not to a person in a car
 * (some 60 dB under the threshold of hearing at that pitch, and under any road noise). Whether Chrome
 * counts the page as audible is not observable from the page; the log has the level played. A whole number
 * of cycles in ten seconds, so the loop has no click. The controls are held only once it plays
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

/** The loop's level (RMS, dBFS) and pitch: over Chromium's audible threshold (`AudioStreamMonitor`,
 *  -72.25 dBFS), far under hearing at 25 Hz. */
export const LOOP_DBFS = -60
const LOOP_HZ = 25

/** A WAV of near-silence: 8 kHz mono 16-bit, `seconds` long, a `hz` tone at `dbfs` (RMS). */
export function silentWav(seconds = SILENCE_S, dbfs = LOOP_DBFS, hz = LOOP_HZ): Blob {
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
  const peak = 32767 * 10 ** (dbfs / 20) * Math.SQRT2
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round(peak * Math.sin((2 * Math.PI * hz * i) / RATE)), true)
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
  logMedia('loop-start', { levelDbfs: LOOP_DBFS, hz: LOOP_HZ, ...snapshot(audio) })
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
  if (phoneVoiceSpeaking()) {
    // Android may pause it while the phone's own voice has the audio: not the user's pause. Played again
    // once that voice is done (`afterOwnAudio`).
    logMedia('loop-paused-unasked', { during: 'phone voice', ...snapshot(of.audio) })
    return
  }
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
