import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// A phone's media session, as the page sees it (made up: jsdom has none).
const handlers: Record<string, (() => void) | null> = {}
const session = {
  metadata: null as { title: string; album: string } | null,
  playbackState: 'none',
  setActionHandler: (action: string, run: (() => void) | null) => (handlers[action] = run),
}
const loops: { src: string; loop: boolean; playing: boolean }[] = []

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:silence', revokeObjectURL: () => {} }))
  vi.stubGlobal(
    'Audio',
    class {
      loop = false
      playing = false
      src: string
      constructor(src: string) {
        this.src = src
        loops.push(this)
      }
      play() {
        this.playing = true
        return Promise.resolve()
      }
      pause() {
        this.playing = false
      }
      removeAttribute() {}
    },
  )
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(m: object) {
        Object.assign(this, m)
      }
    },
  )
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: vi.fn() })
})

const load = async () => {
  const engine = await import('./engine')
  const { useSpeech } = await import('./speech')
  const { useLiveAudio } = await import('./audio-prefs')
  const { useAudioStatus } = await import('./status')
  const { silentWav } = await import('./car-media')
  return { ...engine, useSpeech, useLiveAudio, useAudioStatus, silentWav }
}

afterEach(async () => {
  const { useLive, useSpeech, useLiveAudio } = await load()
  useLive.setState({ phase: 'off' })
  useSpeech.setState({ readAloud: false, speaking: false, front: null })
  useLiveAudio.setState({ nextTrack: 'read' })
  loops.length = 0
  vi.unstubAllGlobals()
})

const ACTIONS = ['play', 'pause', 'stop', 'nexttrack', 'previoustrack']

it('holds the media controls while Live and Read aloud are both on, and lets all of it go when either is off', async () => {
  const { useLive, useSpeech, useAudioStatus } = await load()
  useSpeech.setState({ front: { key: 'd/s', name: 'web-app', reply: null } })
  useLive.setState({ phase: 'listening' })
  expect(session.metadata).toBeNull() // Live alone: nothing held
  useSpeech.setState({ readAloud: true })
  expect(session.metadata).toMatchObject({ title: 'muxtower · web-app · listening', album: 'muxtower' })
  expect(session.playbackState).toBe('paused')
  for (const a of ACTIONS) expect(handlers[a], a).toBeTypeOf('function')
  expect(loops).toHaveLength(1)
  expect(loops[0]).toMatchObject({ src: 'blob:silence', loop: true, playing: true })
  expect(useAudioStatus.getState()).toMatchObject({ handlers: true, loop: 'playing' })

  useSpeech.setState({ speaking: true }) // something said, in any voice
  expect(session.playbackState).toBe('playing')
  useSpeech.setState({ speaking: false })
  expect(session.playbackState).toBe('paused')

  useLive.setState({ phase: 'off' })
  expect(session.metadata).toBeNull()
  expect(session.playbackState).toBe('none')
  for (const a of ACTIONS) expect(handlers[a], a).toBeNull()
  expect(loops[0]!.playing).toBe(false)
  expect(useAudioStatus.getState()).toMatchObject({ handlers: false, loop: 'off' })

  useLive.setState({ phase: 'listening' }) // on again
  expect(handlers.play).toBeTypeOf('function')
  useSpeech.setState({ readAloud: false })
  expect(handlers.play).toBeNull()
  expect(loops.every((l) => !l.playing)).toBe(true)
})

it('the buttons: pause stops speaking, ⏭ reads all, or sends once chosen', async () => {
  const { useLive, useSpeech, useLiveAudio, setLiveTarget, setLiveOps } = await load()
  const sent = vi.fn(() => 'sent' as const)
  setLiveOps({ append: () => {}, clear: () => {}, undo: () => false, send: sent })
  setLiveTarget({ daemonId: 'd', sessionId: 's' })
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'web-app', reply: 'The deploy is done.' } })
  useLive.setState({ phase: 'listening' })

  useSpeech.setState({ speaking: true })
  handlers.pause!()
  expect(useSpeech.getState().speaking).toBe(false)

  handlers.nexttrack!() // Read all: the reply in front, said whole
  expect(useSpeech.getState().caption).toMatchObject({ kind: 'reply', title: 'web-app' })
  expect(sent).not.toHaveBeenCalled()

  useLiveAudio.getState().setNextTrack('send')
  handlers.nexttrack!()
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
  setLiveTarget(null)
})

it('the hub voice and the hold share the controls: what is said while it plays, listening after', async () => {
  const { useLive, useSpeech } = await load()
  const { showSaying } = await import('./media')
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: null } })
  useLive.setState({ phase: 'listening' })
  showSaying({ title: 'Tests pass.', artist: 'api' })
  expect(session.metadata).toMatchObject({ title: 'Tests pass.', artist: 'api' })
  expect(session.playbackState).toBe('playing')
  showSaying(null)
  expect(session.metadata).toMatchObject({ title: 'muxtower · api · listening' })
  expect(handlers.nexttrack).toBeTypeOf('function') // still held
})

it('makes ten seconds of 8-bit silence (over the five Chrome needs to show controls)', async () => {
  const { silentWav } = await load()
  const blob = silentWav()
  expect(blob.type).toBe('audio/wav')
  expect(blob.size).toBe(44 + 80_000)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(bytes.slice(44).every((b) => b === 128)).toBe(true)
})
