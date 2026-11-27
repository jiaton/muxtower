import { create } from 'zustand'
import { useLiveAudio } from './audio-prefs'
import { errorFields, logMedia } from './media-log'

/**
 * Live's own audio on the phone's call path: Read aloud's hub voice and the cues, while the microphone is
 * open, so a phone in hands-free (call) mode stays in it, on its call volume and route, instead of being
 * switched to media for each thing said (which, on a car's Bluetooth, can lose the audio and break Live).
 *
 * What Chromium on Android does (media/audio/android/audio_manager_android.cc): it turns communication mode
 * on when the first microphone input opens with a platform effect (echo cancellation where the phone has
 * one), and off again when the last input closes (`ReleaseInputStream`: normal mode, the Bluetooth
 * hands-free link let go); and it picks each output's usage once, when the output is made: voice
 * communication while the mode is on, media otherwise (`MakeLowLatencyOutputStream`), whatever plays it.
 * So the decisive part is that the microphone stays open while Read aloud speaks (`mic.ts`,
 * `vadStreamOptions`); this path then plays everything from one output made after the microphone opened and
 * kept for all of Live (an idle output is reused for a few seconds, so a new <audio> could be handed one
 * made as media just before), its element taking audio focus once (a WebRTC player's one-shot focus)
 * rather than each mp3 asking for it again.
 *
 * A loopback in the page: what is to be heard plays into one AudioContext's MediaStreamDestination, whose
 * track is sent from one RTCPeerConnection to another; the second's remote track plays in an <audio>
 * element, as a call's far end does. Opened once Live's microphone is open, kept while Live is on (no set-up
 * per thing said), and closed with it: both connections, the tracks, the context and the element. Each thing
 * said is a source node, let go when it ends or stops. Plain browser APIs; nothing leaves the page (the
 * connections' candidates are this device's own).
 */

/** What it needs of the browser (the real ones, or stand-ins in tests). */
export interface CallAudioEnv {
  AudioContext: typeof AudioContext
  RTCPeerConnection: typeof RTCPeerConnection
  audio: () => HTMLAudioElement
}

export interface CallAudio {
  /** Where to connect a node whose sound is to go through the call path (the cues). */
  readonly context: AudioContext
  readonly input: AudioNode
  /** Plays a piece of the hub's voice (an mp3) to its end; rejects if it cannot be decoded or played. */
  play: (blob: Blob) => Promise<void>
  /** Stops what is playing (its `play` resolves). */
  stop: () => void
  /** Lets everything go. */
  close: () => Promise<void>
}

/** How long the far end's jitter buffer may still hold of a piece after its source ended. */
export const PLAYOUT_TAIL_MS = 150
const NEGOTIATE_MS = 5000

/** Whether this browser has what the call path needs. */
export const callAudioPossible = () =>
  typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function' && typeof window.AudioContext === 'function'

const browserEnv = (): CallAudioEnv => ({
  AudioContext: window.AudioContext,
  RTCPeerConnection: window.RTCPeerConnection,
  audio: () => new Audio(),
})

/** Which way Read aloud's hub voice (and Live's cues) go: through the call path while Live is on and the
 *  setting says so (and the browser can), else as media, as outside Live. */
export function readAloudPath(live: boolean, setting: boolean, possible: boolean): 'webrtc' | 'media' {
  return live && setting && possible ? 'webrtc' : 'media'
}

/** Whether the call path is open now (the car-media hold stays off meanwhile: `car-media.ts`). */
export const useCallRoute = create<{ open: boolean }>(() => ({ open: false }))

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} took over ${ms} ms`)), ms))])

export async function openCallAudio(env: CallAudioEnv = browserEnv()): Promise<CallAudio> {
  const context = new env.AudioContext()
  const input = context.createGain()
  const destination = context.createMediaStreamDestination()
  input.connect(destination)
  const sender = new env.RTCPeerConnection()
  const receiver = new env.RTCPeerConnection()
  const element = env.audio()
  const sources = new Set<AudioBufferSourceNode>()
  let closed = false

  const state = () => ({
    context: context.state,
    sender: sender.connectionState,
    receiver: receiver.connectionState,
    elementPaused: element.paused,
  })
  context.onstatechange = () => logMedia('call-audio', { ev: 'context', ...state() })
  receiver.onconnectionstatechange = () => logMedia('call-audio', { ev: 'connection', ...state() })
  for (const ev of ['play', 'playing', 'pause', 'stalled', 'waiting', 'error'] as const)
    element.addEventListener(ev, () => logMedia('call-audio', { ev: `element-${ev}`, ...state() }))

  const close = async () => {
    if (closed) return
    closed = true
    for (const source of sources) stopSource(source)
    sources.clear()
    element.pause()
    element.srcObject = null
    for (const t of destination.stream.getTracks()) t.stop()
    sender.close()
    receiver.close()
    await context.close().catch(() => undefined)
    logMedia('call-audio', { ev: 'closed', context: context.state })
  }

  try {
    sender.onicecandidate = (e) => e.candidate && void receiver.addIceCandidate(e.candidate).catch(() => undefined)
    receiver.onicecandidate = (e) => e.candidate && void sender.addIceCandidate(e.candidate).catch(() => undefined)
    const remote = new Promise<MediaStream>((resolve) => {
      receiver.ontrack = (e) => resolve(e.streams[0] ?? new MediaStream([e.track]))
    })
    for (const track of destination.stream.getAudioTracks()) sender.addTrack(track, destination.stream)
    const offer = await sender.createOffer()
    await sender.setLocalDescription(offer)
    await receiver.setRemoteDescription(offer)
    const answer = await receiver.createAnswer()
    await receiver.setLocalDescription(answer)
    await sender.setRemoteDescription(answer)
    element.srcObject = await withTimeout(remote, NEGOTIATE_MS, 'the loopback')
    await context.resume()
    await element.play()
    logMedia('call-audio', { ev: 'open', ...state() })
  } catch (error) {
    logMedia('call-audio', { ev: 'open-failed', ...errorFields(error), ...state() })
    await close()
    throw error
  }

  function stopSource(source: AudioBufferSourceNode) {
    try {
      source.stop()
    } catch {
      // never started, or already ended
    }
    source.disconnect()
  }

  return {
    context,
    input,
    async play(blob) {
      if (closed) throw new Error('the call path is closed')
      const buffer = await context.decodeAudioData(await blob.arrayBuffer())
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(input)
      sources.add(source)
      await new Promise<void>((resolve) => {
        source.onended = () => {
          sources.delete(source)
          source.disconnect()
          // What the far end still holds plays out before the next piece (or the end) is said.
          setTimeout(resolve, PLAYOUT_TAIL_MS)
        }
        source.start()
      })
    },
    stop() {
      for (const source of sources) stopSource(source)
    },
    close,
  }
}

// --- held while Live is on ---------------------------------------------------------------------------------

let open: CallAudio | null = null
let opening: Promise<CallAudio | null> | null = null

/** The call path, if open (Read aloud plays through it, the cues too). */
export const callAudio = () => open

/** Opens the call path when Live is on and the setting says so (else closes it); logged either way. Called
 *  on Live's start (its tap) and stop, and when the setting changes. */
export async function syncCallAudio(live: boolean, env?: CallAudioEnv): Promise<void> {
  const path = readAloudPath(live, useLiveAudio.getState().callAudio, env !== undefined || callAudioPossible())
  if (path === 'webrtc') {
    if (open || opening) return
    opening = openCallAudio(env).then(
      (made) => made,
      () => null, // logged: Read aloud plays as media
    )
    const made = await opening
    opening = null
    // Turned off (Live, or the setting) while it opened: let it go at once.
    if (made && readAloudPath(liveNow, useLiveAudio.getState().callAudio, true) !== 'webrtc') await made.close()
    else open = made
  } else {
    await opening
    const was = open
    open = null
    await was?.close()
  }
  useCallRoute.setState({ open: open !== null })
  logMedia('route', { path: open ? 'webrtc' : 'media', live, setting: useLiveAudio.getState().callAudio })
}

let liveNow = false
/** Live on or off (`engine.ts`): the call path follows. */
export function liveChanged(live: boolean, env?: CallAudioEnv) {
  liveNow = live
  return syncCallAudio(live, env)
}

/** The setting changed while Live is on: the call path follows. */
useLiveAudio.subscribe((now, was) => {
  if (now.callAudio !== was.callAudio) void syncCallAudio(liveNow)
})
