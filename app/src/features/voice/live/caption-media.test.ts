import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { dismissCaption, keepCaption, readAll, setHubVoice, speak, stopSpeaking, useSpeech, forgetVoiceElement } from './speech'

let finishAudio: (() => void) | null = null
const handlers: Record<string, (() => void) | null> = {}
const session = {
  metadata: null as unknown,
  playbackState: 'none',
  setActionHandler: (a: string, f: (() => void) | null) => (handlers[a] = f),
}

beforeEach(() => {
  forgetVoiceElement()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      play() {
        finishAudio = () => this.onended?.()
        return Promise.resolve()
      }
      pause() {}
    },
  )
  vi.stubGlobal(
    'MediaMetadata',
    class {
      title: string
      artist: string
      album: string
      constructor(m: { title: string; artist: string; album: string }) {
        this.title = m.title
        this.artist = m.artist
        this.album = m.album
      }
    },
  )
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: (u: { onend?: () => void }) => u.onend?.() })
  useSpeech.setState({ caption: null, captionKept: false, speaking: false, front: null })
})
afterEach(() => {
  setHubVoice(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

it('shows what is said, piece by piece, then for a few seconds, unless kept', async () => {
  vi.useFakeTimers()
  setHubVoice(async () => new Blob(['mp3']))
  speak('部署好了。健康检查都通过了。', { title: 'web-app' })
  await settle()
  expect(useSpeech.getState().caption).toMatchObject({ title: 'web-app', kind: 'summary', at: 0, done: false })
  finishAudio?.()
  await settle()
  expect(useSpeech.getState().caption?.done).toBe(true)
  vi.advanceTimersByTime(3000)
  expect(useSpeech.getState().caption).not.toBeNull() // a few seconds after
  vi.advanceTimersByTime(1500)
  expect(useSpeech.getState().caption).toBeNull()
  speak('再来一句。', { title: 'web-app' })
  await settle()
  keepCaption(true)
  finishAudio?.()
  await settle()
  vi.advanceTimersByTime(10_000)
  expect(useSpeech.getState().caption).not.toBeNull() // kept
  dismissCaption()
  expect(useSpeech.getState().caption).toBeNull()
})

it("tells the phone's media controls what plays in the hub's voice, and nothing for the phone's own", async () => {
  setHubVoice(async () => new Blob(['mp3']))
  speak('测试修好了，连跑二十次都通过。还需要你确认一下要不要合并到主分支，以及是否要顺便更新文档。', { title: 'api' })
  await settle()
  const meta = session.metadata as { title: string; artist: string; album: string }
  expect(meta.artist).toBe('api')
  expect(meta.album).toBe('muxtower')
  expect(meta.title).toBe('测试修好了，连跑二十次都通过。') // the first sentence of a long one
  expect(session.playbackState).toBe('playing')
  stopSpeaking()
  expect(session.metadata).toBeNull()
  setHubVoice(null) // the phone's own voice
  speak('一句话。', { title: 'api' })
  await settle()
  expect(session.metadata).toBeNull()
})

it('a reply read whole is a caption of pieces, counted', async () => {
  setHubVoice(async () => new Blob(['mp3']))
  useSpeech.setState({ front: { key: 'd/s', name: 'docs', reply: '第一段写完了。'.repeat(60) } })
  expect(readAll()).toBe(true)
  await settle()
  const caption = useSpeech.getState().caption!
  expect(caption.kind).toBe('reply')
  expect(caption.title).toBe('docs')
  expect(caption.pieces.length).toBeGreaterThan(1)
  finishAudio?.()
  await settle()
  expect(useSpeech.getState().caption?.at).toBe(1)
  stopSpeaking()
})

it('maps the media buttons while the hub speaks (play, pause → stop, next → read all, previous → play again), none after', async () => {
  await import('./play')
  setHubVoice(async () => new Blob(['mp3']))
  speak('部署好了。', { title: 'api' })
  await settle()
  for (const a of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack']) expect(handlers[a], a).toBeTypeOf('function')
  handlers.pause!()
  expect(useSpeech.getState().speaking).toBe(false)
  for (const a of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack']) expect(handlers[a], a).toBeNull()
})
