import { create } from 'zustand'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { chosenLanguages, startSpotter, type Spotter } from './kws'
import { LivePipeline, SHORT_MS, type Ask, type BoxOps, type Cue, type Target } from './pipeline'

/**
 * Live mode: the microphone stays open and what the owner says goes into the message box of the session
 * page in front. A local voice activity detector (Silero VAD, in the browser) cuts speech at pauses of
 * about a second and drops what is not speech, too short or too quiet; only those segments are sent to the
 * daemon's speech to text, and only while listening (`LivePipeline`). No audio is kept anywhere.
 *
 * One for the whole app, so it carries on from one session page to the next: each page says it is in
 * front (`setLiveTarget`) and how its box is written to (`setLiveOps`).
 */

// The VAD's model and worklet, and ONNX Runtime's WebAssembly, from a CDN at the versions bundled
// (`live.test.ts` keeps them in step): fetched once Live is turned on, never part of the app's download.
export const VAD_VERSION = '0.0.31'
export const ORT_VERSION = '1.31.1'
const VAD_ASSETS = `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_VERSION}/dist/`
const ORT_ASSETS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`

const PAUSE_MS = 1000 // the silence that ends a segment
const MIN_SPEECH_MS = 400 // shorter: a blip, dropped
const MIN_LEVEL = 0.006 // RMS: quieter than this is not the owner talking to the phone
const RATE = 16000 // the VAD's audio: 16 kHz mono
const LEAD_MS = 300 // the VAD keeps this much before speech starts
const TAIL_KEPT_MS = 200 // of the silence that ended it, what is sent along
const MAX_SEGMENT_S = 110 // the daemon takes up to ~2 minutes of WAV: a longer monologue goes in parts

export type Phase = 'off' | 'starting' | 'listening' | 'paused' | 'error'

interface LiveState {
  phase: Phase
  speaking: boolean
  pending: number
  error: string | null
  /** The on-device voice commands: loading (with download progress, bytes), ready, or off (failed). */
  commands: { state: 'loading' | 'ready' | 'off'; received?: number; total?: number; note?: string }
}

export const useLive = create<LiveState>(() => ({
  phase: 'off',
  speaking: false,
  pending: 0,
  error: null,
  commands: { state: 'off' },
}))

let target: Target | null = null
let ops: BoxOps | null = null
let vad: { start: () => Promise<void>; pause: () => Promise<void>; destroy: () => Promise<void> } | null = null
let wakeLock: { release: () => Promise<void> } | null = null
let spotter: Spotter | null = null

/** The session page in front (null when none is): a segment lands where its speech started. */
export function setLiveTarget(next: Target | null) {
  target = next
}

export function setLiveOps(next: BoxOps) {
  ops = next
}

const pipeline = new LivePipeline({
  transcribe: (where, audio, ask) => transcribe(where, audio, ask),
  ops: () => ops ?? NO_OPS,
  cue: (cue) => playCue(cue),
  spot: (pcm) => (spotter ? spotter.spot(pcm) : Promise.resolve(null)),
  changed: () =>
    useLive.setState((s) => ({
      pending: pipeline.pending,
      error: pipeline.error,
      phase: s.phase === 'off' || s.phase === 'starting' ? s.phase : pipeline.state,
    })),
  count,
})

const NO_OPS: BoxOps = { append: () => {}, clear: () => {}, undo: () => false, send: () => 'empty' }

async function transcribe(where: Target, audio: Blob, ask: Ask): Promise<{ text: string; language: string | null }> {
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === where.daemonId)
  if (!daemon) throw new Error('that daemon is gone')
  const result = await createDaemonClient(daemon).POST('/v1/asr', {
    params: { query: { source: 'live', hint: ask.hint ?? null, language: ask.language ?? null } },
    body: audio as never,
    bodySerializer: (body: unknown) => body as Blob,
    headers: { 'Content-Type': 'audio/wav' },
  })
  const said = unwrap(result)
  return { text: said.text.trim(), language: said.language ?? null }
}

/** Turns Live on (asking for the microphone) or off (letting it go). */
export async function toggleLive() {
  if (useLive.getState().phase !== 'off') return stopLive()
  unlockCues()
  useLive.setState({ phase: 'starting', error: null })
  void loadCommands()
  try {
    const { MicVAD } = await import('@ricky0123/vad-web')
    let started: Target | null = null
    vad = await MicVAD.new({
      model: 'v5',
      baseAssetPath: VAD_ASSETS,
      onnxWASMBasePath: ORT_ASSETS,
      redemptionMs: PAUSE_MS,
      minSpeechMs: MIN_SPEECH_MS,
      preSpeechPadMs: LEAD_MS,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      onSpeechStart: () => {
        started = target // where this segment belongs, wherever the owner goes before it ends
        useLive.setState({ speaking: true })
      },
      onVADMisfire: () => useLive.setState({ speaking: false }),
      onSpeechEnd: (audio: Float32Array) => {
        useLive.setState({ speaking: false })
        // The segment holds the lead-in and the second of silence that ended it: its speech is what is between
        // (how long it was said decides whether it may be a command), and most of that silence is not sent.
        const said = audio.subarray(0, Math.max(0, audio.length - ((PAUSE_MS - TAIL_KEPT_MS) * RATE) / 1000))
        if (rms(said) < MIN_LEVEL) return count('dropped')
        const speechMs = (n: number) => Math.max(0, (n / RATE) * 1000 - LEAD_MS - TAIL_KEPT_MS)
        for (const part of parts(said)) {
          const ms = speechMs(part.length)
          void pipeline.segment({ target: started, audio: wav(part), ms, pcm: ms <= SHORT_MS ? part : undefined })
        }
      },
    })
    await vad.start()
    pipeline.state = 'listening'
    useLive.setState({ phase: 'listening' })
    await holdScreen()
  } catch (error) {
    await stopLive()
    useLive.setState({ phase: 'error', error: micError(error) })
  }
}

export async function stopLive() {
  const was = vad
  vad = null
  await was?.destroy().catch(() => undefined) // the microphone is let go
  spotter?.dispose() // the keyword spotter's Worker, its WebAssembly and model: nothing stays loaded
  spotter = null
  loading += 1 // a load still under way is dropped when it lands
  useLive.setState({ commands: { state: 'off' } })
  await wakeLock?.release().catch(() => undefined)
  wakeLock = null
  useLive.setState({ phase: 'off', speaking: false })
}

let loading = 0

/** The on-device voice commands, for the languages chosen: from the browser's cache (downloaded the first
 *  time). Live works without them meanwhile, or if they fail: commands are then read off the transcript. */
async function loadCommands() {
  const run = ++loading
  useLive.setState({ commands: { state: 'loading' } })
  const started = performance.now()
  try {
    const ready = await startSpotter(chosenLanguages(), (received, total) => {
      if (run === loading) useLive.setState({ commands: { state: 'loading', received, total } })
    })
    if (run !== loading) return ready.dispose() // Live was turned off meanwhile
    spotter = ready
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    useLive.setState({ commands: { state: 'ready', note: `ready in ${seconds} s` } })
  } catch (error) {
    if (run !== loading) return
    useLive.setState({ commands: { state: 'off', note: error instanceof Error ? error.message : String(error) } })
  }
}

export function resumeLive() {
  pipeline.resume()
}

export function pauseLive() {
  pipeline.pause()
}

function micError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError'))
    return 'Microphone access is blocked for this site.'
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No microphone found.'
  return `Live could not start: ${error instanceof Error ? error.message : String(error)}`
}

// --- the screen stays on while Live is (a phone in a car mount) ------------------------------------------

async function holdScreen() {
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
  if (!nav.wakeLock || !matchMedia('(pointer: coarse)').matches) return
  try {
    wakeLock = await nav.wakeLock.request('screen')
  } catch {
    wakeLock = null // not allowed now (a battery saver): Live works, the screen may dim
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // A wake lock ends when the page is hidden: taken again when it is back in front.
    if (document.visibilityState === 'visible' && vad && !wakeLock) void holdScreen()
    else if (document.visibilityState === 'hidden') wakeLock = null
  })
}

// --- audio -------------------------------------------------------------------------------------------------

export function rms(audio: Float32Array): number {
  let sum = 0
  for (const s of audio) sum += s * s
  return Math.sqrt(sum / Math.max(1, audio.length))
}

function parts(audio: Float32Array): Float32Array[] {
  const size = MAX_SEGMENT_S * RATE
  const out: Float32Array[] = []
  for (let i = 0; i < audio.length; i += size) out.push(audio.subarray(i, i + size))
  return out
}

/** 16 kHz mono 16-bit PCM WAV, as the daemon's speech to text takes it. */
export function wav(audio: Float32Array, rate = RATE): Blob {
  const data = new DataView(new ArrayBuffer(44 + audio.length * 2))
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  data.setUint32(4, 36 + audio.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true) // PCM
  data.setUint16(22, 1, true) // mono
  data.setUint32(24, rate, true)
  data.setUint32(28, rate * 2, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  text(36, 'data')
  data.setUint32(40, audio.length * 2, true)
  audio.forEach((s, i) => data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([data], { type: 'audio/wav' })
}

// --- cues: a short sound for each thing done by voice, to follow without looking ------------------------------

let cues: AudioContext | null = null

/** Made on the tap that turns Live on: a browser lets a page play sound only after a gesture. */
function unlockCues() {
  try {
    cues ??= new AudioContext()
    void cues.resume()
  } catch {
    cues = null
  }
}

const TONES: Record<Cue, [number, number][]> = {
  sent: [
    [660, 0.07],
    [990, 0.09],
  ],
  paused: [
    [520, 0.08],
    [330, 0.12],
  ],
  resumed: [
    [330, 0.08],
    [520, 0.12],
  ],
  cleared: [
    [440, 0.06],
    [440, 0.06],
  ],
  undone: [[600, 0.08]],
  empty: [[220, 0.18]],
  error: [
    [200, 0.1],
    [180, 0.14],
  ],
}

export function playCue(cue: Cue) {
  if (!cues) return
  let at = cues.currentTime
  for (const [hz, s] of TONES[cue]) {
    const osc = cues.createOscillator()
    const gain = cues.createGain()
    osc.type = cue === 'empty' || cue === 'error' ? 'triangle' : 'sine'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01) // subtle
    gain.gain.exponentialRampToValueAtTime(0.0001, at + s)
    osc.connect(gain).connect(cues.destination)
    osc.start(at)
    osc.stop(at + s + 0.02)
    at += s + 0.04
  }
}

// --- usage: segments and uploads per day, on this browser ------------------------------------------------------

const COUNTS_KEY = 'muxtower.live.counts'
type Counted = 'segment' | 'uploaded' | 'dropped' | 'command' | 'spotted'
type Counts = Record<string, Partial<Record<Counted, number>>>

function count(what: Counted) {
  try {
    const all = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '{}') as Counts
    const day = new Date().toISOString().slice(0, 10)
    const today = { ...all[day], [what]: (all[day]?.[what] ?? 0) + 1 }
    const kept = Object.fromEntries([...Object.entries({ ...all, [day]: today })].sort().slice(-30))
    localStorage.setItem(COUNTS_KEY, JSON.stringify(kept))
  } catch {
    // storage blocked: not counted
  }
}

/** The counts kept, by day (for a look at real use: the daemon's audit log counts the uploads too). */
export function liveCounts(): Counts {
  try {
    return JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '{}') as Counts
  } catch {
    return {}
  }
}
