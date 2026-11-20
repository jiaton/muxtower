import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'

// A phone's media session, as the page sees it (made up: jsdom has none).
const handlers: Record<string, (() => void) | null> = {}
let registrations = 0
const session = {
  metadata: null as { title: string; album: string } | null,
  playbackState: 'none',
  setActionHandler: (action: string, run: (() => void) | null) => {
    registrations += 1
    handlers[action] = run
  },
}

// Audio elements: the silent loop (`loop` set) and the hub's mp3s. play() resolves at once, or waits for
// `release()` while `holdPlays` (Chrome taking its time), or is refused while `refusePlays`.
type Listener = () => void
class FakeAudio {
  loop = false
  paused = true
  readyState = 4
  volume = 1
  muted = false
  currentTime = 0
  duration = 10
  src: string
  onended: Listener | null = null
  onerror: Listener | null = null
  onplay: Listener | null = null
  onpause: Listener | null = null
  listeners: Record<string, Listener[]> = {}
  constructor(src: string) {
    this.src = src
    audios.push(this)
  }
  addEventListener(ev: string, run: Listener) {
    ;(this.listeners[ev] ??= []).push(run)
  }
  fire(ev: string) {
    for (const run of this.listeners[ev] ?? []) run()
    ;(this as unknown as Record<string, Listener | null>)[`on${ev}`]?.()
  }
  play() {
    if (refusePlays) return Promise.reject(new DOMException('play() needs a gesture', 'NotAllowedError'))
    const start = () => {
      this.paused = false
      this.fire('play')
    }
    if (holdPlays) return new Promise<void>((resolve) => releases.push(() => (start(), resolve())))
    start()
    return Promise.resolve()
  }
  /** The page's own pause, or the system's (`fire` the event: the element tells either the same way). */
  pause() {
    if (this.paused) return
    this.paused = true
    this.fire('pause')
  }
  removeAttribute() {}
}
let audios: FakeAudio[] = []
let holdPlays = false
let refusePlays = false
let releases: (() => void)[] = []
const release = () => releases.splice(0).forEach((r) => r())
const loops = () => audios.filter((a) => a.loop)

let logged: Record<string, unknown>[] = []
let posts: string[] = []
const said: string[] = []

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:silence', revokeObjectURL: () => {} }))
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(m: object) {
        Object.assign(this, m)
      }
    },
  )
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: (u: { text: string }) => said.push(u.text) })
  server.use(
    http.post(`${DAEMON_URL}/v1/diagnostics`, async ({ request }) => {
      const body = await request.text()
      posts.push(body)
      const batch = JSON.parse(body) as { source: string; entries: Record<string, unknown>[] }
      expect(batch.source).toBe('media')
      logged.push(...batch.entries)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  addDaemon()
})

const load = async () => {
  const engine = await import('./engine')
  const { useSpeech, setHubVoice, speak } = await import('./speech')
  const { useLiveAudio } = await import('./audio-prefs')
  const { useAudioStatus } = await import('./status')
  const { silentWav } = await import('./car-media')
  const { flushMediaLog, resetMediaLog } = await import('./media-log')
  return { ...engine, useSpeech, setHubVoice, speak, useLiveAudio, useAudioStatus, silentWav, flushMediaLog, resetMediaLog }
}

/** What the hub was told so far: the event names, in order. */
const events = async () => {
  const { flushMediaLog } = await load()
  await flushMediaLog()
  return logged.map((e) => e.e)
}

afterEach(async () => {
  const { useLive, useSpeech, useLiveAudio, setHubVoice, resetMediaLog } = await load()
  holdPlays = false
  refusePlays = false
  release()
  useLive.setState({ phase: 'off' })
  useSpeech.setState({ readAloud: false, speaking: false, front: null, caption: null })
  useLiveAudio.setState({ nextTrack: 'read' })
  setHubVoice(null)
  resetMediaLog()
  audios = []
  logged = []
  posts = []
  said.length = 0
  vi.unstubAllGlobals()
})

const ACTIONS = ['play', 'pause', 'stop', 'nexttrack', 'previoustrack']

it('holds the controls once the loop plays, "playing" all along, and lets all of it go when Live or Read aloud is off', async () => {
  const { useLive, useSpeech, useAudioStatus } = await load()
  holdPlays = true
  useSpeech.setState({ front: { key: 'd/s', name: 'web-app', reply: null } })
  useLive.setState({ phase: 'listening' })
  expect(session.metadata).toBeNull() // Live alone: nothing held
  useSpeech.setState({ readAloud: true })
  expect(loops()).toHaveLength(1)
  expect(session.metadata).toBeNull() // not before the loop plays
  expect(handlers.play ?? null).toBeNull()
  release()
  await vi.waitFor(() => expect(session.metadata).toMatchObject({ title: 'muxtower · web-app · listening', album: 'muxtower' }))
  expect(session.playbackState).toBe('playing') // not "paused" while nothing is said
  for (const a of ACTIONS) expect(handlers[a], a).toBeTypeOf('function')
  expect(loops()[0]).toMatchObject({ src: 'blob:silence', loop: true, paused: false })
  expect(useAudioStatus.getState()).toMatchObject({ handlers: true, loop: 'playing' })

  useSpeech.setState({ speaking: true })
  expect(session.playbackState).toBe('playing')
  useSpeech.setState({ speaking: false })
  expect(session.playbackState).toBe('playing')

  useLive.setState({ phase: 'off' })
  expect(session.metadata).toBeNull()
  expect(session.playbackState).toBe('none')
  for (const a of ACTIONS) expect(handlers[a], a).toBeNull()
  expect(loops()[0]!.paused).toBe(true)
  expect(useAudioStatus.getState()).toMatchObject({ handlers: false, loop: 'off' })
  expect(loops()[0]!.paused).toBe(true) // our own pause: not taken for the user's, not played again

  const log = await events()
  expect(log.indexOf('loop-played')).toBeLessThan(log.indexOf('handlers'))
  expect(log).toEqual(expect.arrayContaining(['log-start', 'loop-start', 'state', 'loop-stop', 'log-stop']))
  expect(log).not.toContain('loop-paused-unasked')
  expect(logged.find((e) => e.e === 'handlers')).toMatchObject({ on: true, set: 'play,pause,stop,nexttrack,previoustrack' })
  expect(logged.find((e) => e.e === 'state')).toMatchObject({ playback: 'playing', meta: 'listening' })
})

it('a loop the browser will not play still holds the controls (for the hub voice), and says why in the log', async () => {
  const { useLive, useSpeech, useAudioStatus } = await load()
  refusePlays = true
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'web-app', reply: null } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  expect(useAudioStatus.getState().loop).toBe('blocked')
  await events()
  expect(logged.find((e) => e.e === 'loop-blocked')).toMatchObject({ error: 'NotAllowedError', paused: true })
})

it('play/pause stops what is said, else plays the latest; ⏭ reads all, or sends once chosen', async () => {
  const { useLive, useSpeech, useLiveAudio, setLiveTarget, setLiveOps } = await load()
  const sent = vi.fn(() => 'sent' as const)
  setLiveOps({ append: () => {}, clear: () => {}, undo: () => false, send: sent })
  setLiveTarget({ daemonId: 'd', sessionId: 's' })
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'web-app', reply: 'The deploy is done.' } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.pause).toBeTypeOf('function'))

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
  await events()
  expect(logged.filter((e) => e.e === 'action').map((e) => e.action)).toEqual(['pause', 'nexttrack', 'nexttrack'])
  expect(logged.filter((e) => e.e === 'action-done').map((e) => e.did)).toEqual(['stopped', 'read all', 'sent'])
})

it("sets the handlers again after each of the hub's mp3s ends", async () => {
  const { useLive, useSpeech, setHubVoice, speak } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: null } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  setHubVoice(async () => new Blob(['mp3']))
  speak('Tests pass.')
  await vi.waitFor(() => expect(audios.filter((a) => !a.loop)).toHaveLength(1))
  const mp3 = audios.find((a) => !a.loop)!
  await vi.waitFor(() => expect(session.metadata).toMatchObject({ title: 'Tests pass.' }))
  const before = registrations
  mp3.fire('ended')
  expect(registrations).toBeGreaterThan(before) // set again at once
  await vi.waitFor(() => expect(session.metadata).toMatchObject({ title: 'muxtower · api · listening' }))
  for (const a of ACTIONS) expect(handlers[a], a).toBeTypeOf('function')
  expect(session.playbackState).toBe('playing')
  expect(await events()).toEqual(expect.arrayContaining(['mp3', 'reassert']))
  expect(logged.filter((e) => e.e === 'mp3').map((e) => e.ev)).toEqual(['play', 'ended'])
  expect(logged.find((e) => e.e === 'reassert')).toMatchObject({ why: 'mp3 ended' })
})

it("a pause of the loop it did not make is the user's pause: what is said stops, and the loop plays again", async () => {
  const { useLive, useSpeech } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: null } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  useSpeech.setState({ speaking: true })
  const loop = loops()[0]!
  loop.pause() // the car's pause, taken by the element itself
  expect(useSpeech.getState().speaking).toBe(false)
  await vi.waitFor(() => expect(loop.paused).toBe(false))
  expect(useLive.getState().phase).toBe('listening')
  expect(await events()).toEqual(expect.arrayContaining(['loop-paused-unasked', 'loop-resume', 'loop-resumed']))
  expect(logged.find((e) => e.e === 'action')).toMatchObject({ action: 'stop', via: 'loop paused' })
})

it('a loop the system paused plays again on the next button, and the log says so', async () => {
  const { useLive, useSpeech } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: 'Done.' } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  const loop = loops()[0]!
  loop.paused = true // paused with no event (a page put away)
  handlers.nexttrack!()
  await vi.waitFor(() => expect(loop.paused).toBe(false))
  await events()
  expect(logged.find((e) => e.e === 'loop-resume')).toMatchObject({ why: 'nexttrack', paused: true })
})

it('a button with nothing to play says so, and a failure is said and logged: never silent', async () => {
  const { useLive, useSpeech } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: null } }) // no ids: nothing to play
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  handlers.play!()
  await vi.waitFor(() => expect(said).toEqual(['Nothing to read yet']))
  handlers.nexttrack!() // no reply to read either
  await vi.waitFor(() => expect(said).toHaveLength(2))

  const { daemons } = (await import('@/lib/daemons/store')).useDaemonsStore.getState()
  server.use(http.post(`${DAEMON_URL}/v1/sessions/s1/spoken`, () => HttpResponse.json({ detail: 'limit' }, { status: 409 })))
  useSpeech.setState({ front: { key: 'k', daemonId: daemons[0]!.id, sessionId: 's1', name: 'api', reply: 'Fixed it.' } })
  handlers.previoustrack!()
  await vi.waitFor(() => expect(said).toContain("Today's spoken summaries are used up"))
  await vi.waitFor(async () => expect(await events()).toContain('play-failed'))
  expect(logged.filter((e) => e.e === 'action-done').map((e) => e.did)).toEqual([
    'nothing: no session in front',
    'nothing: no reply',
    'failed: limit',
  ])
})

it("logs an mp3 the browser refuses to play, by the error's name", async () => {
  const { useLive, useSpeech, setHubVoice, speak } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'api', reply: null } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  setHubVoice(async () => new Blob(['mp3']))
  refusePlays = true
  speak('Tests pass.')
  await vi.waitFor(async () => expect(await events()).toContain('mp3'))
  expect(logged.find((e) => e.e === 'mp3')).toMatchObject({ ev: 'play-rejected', error: 'NotAllowedError' })
})

it('tells the hub no content: no session names, summaries or replies', async () => {
  const { useLive, useSpeech, setHubVoice, speak } = await load()
  useSpeech.setState({ readAloud: true, front: { key: 'd/s', name: 'secret-project', reply: 'Private reply text.' } })
  useLive.setState({ phase: 'listening' })
  await vi.waitFor(() => expect(handlers.play).toBeTypeOf('function'))
  setHubVoice(async () => new Blob(['mp3']))
  speak('A private summary.', { title: 'secret-project' })
  await vi.waitFor(() => expect(audios.some((a) => !a.loop)).toBe(true))
  audios.find((a) => !a.loop)!.fire('ended')
  handlers.nexttrack!()
  await events()
  expect(posts.length).toBeGreaterThan(0)
  for (const body of posts) expect(body).not.toMatch(/secret-project|Private reply|private summary|Tests pass/i)
})

it('makes ten seconds of near-silence: 16-bit samples of -1, 0 or 1, not all zero', async () => {
  const { silentWav } = await load()
  const blob = silentWav()
  expect(blob.type).toBe('audio/wav')
  expect(blob.size).toBe(44 + 160_000)
  const view = new DataView(await blob.arrayBuffer())
  expect(view.getUint16(34, true)).toBe(16)
  const samples = Array.from({ length: 80_000 }, (_, i) => view.getInt16(44 + i * 2, true))
  expect(samples.every((s) => s >= -1 && s <= 1)).toBe(true)
  expect(new Set(samples)).toEqual(new Set([-1, 0, 1]))
})
