import { afterEach, beforeEach, expect, it } from 'vitest'
import { useLiveAudio } from './audio-prefs'
import { callAudio, liveChanged, openCallAudio, readAloudPath, useCallRoute, type CallAudioEnv } from './call-audio'

// Stand-ins for the browser's Web Audio, WebRTC and <audio>: what the loopback makes, connects and lets go.
// They prove the set-up and the teardown; that Android then plays it on the call path is not provable here.

class FakeTrack {
  readyState = 'live'
  stop() {
    this.readyState = 'ended'
  }
}
class FakeStream {
  readonly tracks: FakeTrack[]
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks
  }
  getTracks = () => this.tracks
  getAudioTracks = () => this.tracks
}
class FakeNode {
  connected = new Set<unknown>()
  connect(to: unknown) {
    this.connected.add(to)
    return to
  }
  disconnect() {
    this.connected.clear()
  }
}
class FakeSource extends FakeNode {
  buffer: unknown = null
  onended: (() => void) | null = null
  started = false
  stopped = false
  start() {
    this.started = true
    setTimeout(() => !this.stopped && this.onended?.(), 20) // a short piece
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.onended?.()
  }
}
let contexts: FakeContext[] = []
class FakeContext {
  state = 'suspended'
  onstatechange: (() => void) | null = null
  destination = new FakeNode()
  sources: FakeSource[] = []
  streamDestination = Object.assign(new FakeNode(), { stream: new FakeStream([new FakeTrack()]) })
  constructor() {
    contexts.push(this)
  }
  createGain = () => new FakeNode()
  createMediaStreamDestination = () => this.streamDestination
  createBufferSource = () => {
    const s = new FakeSource()
    this.sources.push(s)
    return s
  }
  decodeAudioData = async (data: ArrayBuffer) => {
    if (data.byteLength === 0) throw new DOMException('Unable to decode audio data', 'EncodingError')
    return { duration: 0.02 }
  }
  resume = async () => {
    this.state = 'running'
  }
  close = async () => {
    this.state = 'closed'
  }
}
let connections: FakePeer[] = []
class FakePeer {
  connectionState = 'new'
  added: unknown[] = []
  ontrack: ((e: { streams: FakeStream[]; track: FakeTrack }) => void) | null = null
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  constructor() {
    connections.push(this)
  }
  addTrack(track: unknown) {
    this.added.push(track)
  }
  addIceCandidate = async () => undefined
  createOffer = async () => ({ type: 'offer', sdp: 'v=0' })
  createAnswer = async () => ({ type: 'answer', sdp: 'v=0' })
  setLocalDescription = async () => undefined
  setRemoteDescription = async (d: { type: string }) => {
    // The receiving end hears the sender's track once it has the offer.
    if (d.type === 'offer') queueMicrotask(() => this.ontrack?.({ streams: [new FakeStream([new FakeTrack()])], track: new FakeTrack() }))
  }
  close() {
    this.connectionState = 'closed'
  }
}
let elements: FakeElement[] = []
class FakeElement {
  paused = true
  srcObject: unknown = null
  refuse = false
  constructor() {
    elements.push(this)
  }
  addEventListener() {}
  play = async () => {
    if (this.refuse) throw new DOMException('play() failed', 'NotAllowedError')
    this.paused = false
  }
  pause() {
    this.paused = true
  }
}

const env = (refuse = false): CallAudioEnv => ({
  AudioContext: FakeContext as unknown as typeof AudioContext,
  RTCPeerConnection: FakePeer as unknown as typeof RTCPeerConnection,
  audio: () => Object.assign(new FakeElement(), { refuse }) as unknown as HTMLAudioElement,
})
const mp3 = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })

beforeEach(() => {
  contexts = []
  connections = []
  elements = []
  useLiveAudio.setState({ callAudio: true })
})
afterEach(async () => {
  await liveChanged(false, env())
})

it('takes the call path only while Live is on, the setting on and the browser able; else media', () => {
  expect(readAloudPath(true, true, true)).toBe('webrtc')
  expect(readAloudPath(false, true, true)).toBe('media')
  expect(readAloudPath(true, false, true)).toBe('media')
  expect(readAloudPath(true, true, false)).toBe('media')
})

it('sends a context’s stream from one connection to the other, and plays the far end in an element', async () => {
  const call = await openCallAudio(env())
  const [sender, receiver] = connections
  expect(sender!.added).toHaveLength(1) // the destination's track
  expect(elements[0]!.srcObject).toBeInstanceOf(FakeStream) // the receiver's remote stream
  expect(elements[0]!.paused).toBe(false)
  expect(contexts[0]!.state).toBe('running')
  expect(receiver!.connectionState).toBe('new')
  await call.close()
})

it('plays each piece to its end and lets its source go; Live stopped lets everything go', async () => {
  const call = await openCallAudio(env())
  await call.play(mp3())
  await call.play(mp3())
  const [context] = contexts
  expect(context!.sources).toHaveLength(2)
  expect(context!.sources.every((s) => s.started && s.connected.size === 0)).toBe(true) // none left connected
  await call.close()
  expect(connections.map((c) => c.connectionState)).toEqual(['closed', 'closed'])
  expect(context!.streamDestination.stream.getTracks().every((t) => t.readyState === 'ended')).toBe(true)
  expect(context!.state).toBe('closed')
  expect(elements[0]!.srcObject).toBeNull()
  await expect(call.play(mp3())).rejects.toThrow('closed')
})

it('stops what it plays at once (its play resolves), and a piece it cannot decode fails', async () => {
  const call = await openCallAudio(env())
  const playing = call.play(mp3())
  await new Promise((r) => setTimeout(r, 0))
  call.stop()
  await playing
  expect(contexts[0]!.sources[0]!.stopped).toBe(true)
  await expect(call.play(new Blob([]))).rejects.toThrow('Unable to decode')
  await call.close()
})

it('lets go of what it made when it cannot open (the element refused), so Read aloud plays as media', async () => {
  await expect(openCallAudio(env(true))).rejects.toThrow('play() failed')
  expect(connections.map((c) => c.connectionState)).toEqual(['closed', 'closed'])
  expect(contexts[0]!.state).toBe('closed')
})

it('opens with Live and closes with it; follows the setting turned off while Live is on', async () => {
  await liveChanged(true, env())
  expect(callAudio()).not.toBeNull()
  expect(useCallRoute.getState().open).toBe(true)
  useLiveAudio.setState({ callAudio: false })
  await new Promise((r) => setTimeout(r, 0))
  await liveChanged(true, env()) // settles what the setting started
  expect(callAudio()).toBeNull()
  expect(useCallRoute.getState().open).toBe(false)
  expect(connections.every((c) => c.connectionState === 'closed')).toBe(true)
  useLiveAudio.setState({ callAudio: true })
  await liveChanged(true, env())
  expect(useCallRoute.getState().open).toBe(true)
  await liveChanged(false, env())
  expect(callAudio()).toBeNull()
  expect(connections.every((c) => c.connectionState === 'closed')).toBe(true)
  expect(contexts.every((c) => c.state === 'closed')).toBe(true)
})
