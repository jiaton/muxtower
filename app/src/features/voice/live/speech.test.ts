import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetVoiceElement, heardSummary, pieces, readAll, sayFound, setCallPlayer, setHubVoice, speak, speakable, stopSpeaking, useSpeech } from './speech'

const said: string[] = []
beforeEach(() => {
  said.length = 0
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ lang: 'zh-CN', name: 'zh' }],
    cancel: vi.fn(),
    speak: (u: { text: string; onend?: () => void }) => {
      said.push(u.text)
      u.onend?.()
    },
  })
  useSpeech.setState({ readAloud: true, speaking: false, last: null, unheard: {}, front: null })
})
afterEach(() => vi.unstubAllGlobals())

it('says a long text in pieces, at sentence ends where it can', () => {
  const text = '第一句话说完了。'.repeat(30)
  const parts = pieces(text, 60)
  expect(parts.every((p) => p.length <= 60)).toBe(true)
  expect(parts.every((p) => p.endsWith('。'))).toBe(true)
  expect(parts.join('')).toBe(text)
})

it('reads a reply whole without its code or markdown marks', () => {
  expect(speakable('**Done.** Run `make check`:\n```sh\nmake check\n```\nSee [docs](http://x).')).toBe(
    'Done. Run make check: a block of code. See docs.',
  )
})

it('says a summary of the session in front only; one that came while away is marked new, not said later', () => {
  heardSummary({ key: 'd/other', text: '别的会话做完了', reply: 'r' }, 'd/s1')
  expect(said).toEqual([]) // not the one in front: not said
  expect(useSpeech.getState().unheard).toEqual({ 'd/other': true }) // Play shows it new
  heardSummary({ key: 'd/s1', text: '测试修好了，等你确认', reply: 'Fixed it.\n```\ncode\n```' }, 'd/s1')
  expect(said).toEqual(['测试修好了，等你确认'])
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  heardSummary({ key: 'd/s1', text: '又一轮', reply: 'r' }, 'd/s1')
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  expect(said).toHaveLength(1) // the page hidden: not said
  expect(useSpeech.getState().unheard['d/s1']).toBe(true)
  sayFound('d/s1', '又一轮', 'r') // played
  expect(said.at(-1)).toBe('又一轮')
  expect(useSpeech.getState().unheard['d/s1']).toBeUndefined()
  useSpeech.setState({ front: { key: 'd/s1', reply: 'Fixed it.\n```\ncode\n```' } })
  expect(readAll()).toBe(true) // the latest reply of the session in front
  expect(said.at(-1)).toBe('Fixed it. a block of code.')
})

it('a summary that could not be made says why, then the start of the reply', () => {
  heardSummary({ key: 'd/s1', text: null, reply: 'The build is green.', error: 'failed', language: 'en' }, 'd/s1')
  expect(said).toEqual(['The summary could not be made. The build is green.'])
  stopSpeaking()
  expect(useSpeech.getState().speaking).toBe(false)
})

it('is quiet while it speaks and for a tail after, and knows what overlapped that time', async () => {
  const { quiet, overlapsSpeech, speak, TAIL_MS } = await import('./speech')
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  let finish: (() => void) | undefined
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (u: { onend?: () => void }) => (finish = u.onend),
  })
  speak('一句话')
  expect(quiet()).toBe(true)
  vi.setSystemTime(12_000)
  finish?.() // done speaking at 12000
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(useSpeech.getState().speaking).toBe(false)
  expect(quiet()).toBe(true) // the tail
  expect(overlapsSpeech(11_500, 13_000)).toBe(true) // began while it spoke, ended after
  vi.setSystemTime(12_000 + TAIL_MS + 1)
  expect(quiet()).toBe(false)
  expect(overlapsSpeech(12_000 + TAIL_MS + 1, 14_000)).toBe(false)
  vi.useRealTimers()
})

describe("the hub's voice in Live", () => {
  const audios: string[] = []
  beforeEach(() => {
    audios.length = 0
    forgetVoiceElement()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:mp3', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'Audio',
      class {
        src = ''
        onended: (() => void) | null = null
        paused = true
        constructor() {
          audios.push('made')
        }
        play() {
          this.paused = false
          setTimeout(() => this.onended?.(), 0)
          return Promise.resolve()
        }
        pause() {
          this.paused = true
        }
      },
    )
    setHubVoice(async () => new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }))
  })
  afterEach(() => {
    setHubVoice(null)
    setCallPlayer(null)
  })

  it("plays through Live's call path while it is open: no media element; stopping stops it", async () => {
    const played: Blob[] = []
    const player = { play: vi.fn(async (b: Blob) => void played.push(b)), stop: vi.fn() }
    setCallPlayer(() => player)
    speak('Done. Both tests pass.')
    await vi.waitFor(() => expect(useSpeech.getState().speaking).toBe(false))
    expect(played).toHaveLength(1)
    expect(audios).toEqual([]) // never an <audio> element: nothing played as media
    stopSpeaking()
    expect(player.stop).toHaveBeenCalled()
  })

  it('plays as media through its <audio> element when the call path is not open (outside Live, or turned off)', async () => {
    setCallPlayer(() => null)
    speak('Done. Both tests pass.')
    await vi.waitFor(() => expect(useSpeech.getState().speaking).toBe(false))
    expect(audios).toEqual(['made'])
  })
})
