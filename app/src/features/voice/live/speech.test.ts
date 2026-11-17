import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { heardSummary, pieces, readAll, sayAgain, speakable, stopSpeaking, useSpeech } from './speech'

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
  useSpeech.setState({ readAloud: true, speaking: false, last: null })
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
    'Done. Run make check: 一段代码。 See docs.',
  )
})

it('says a summary of the session in front only; keeps it to say again; reads the reply whole on asking', () => {
  heardSummary({ key: 'd/other', text: '别的会话做完了', reply: 'r' }, 'd/s1')
  expect(said).toEqual([]) // not the one in front: kept, not said
  heardSummary({ key: 'd/s1', text: '测试修好了，等你确认', reply: 'Fixed it.\n```\ncode\n```' }, 'd/s1')
  expect(said).toEqual(['测试修好了，等你确认'])
  expect(sayAgain()).toBe(true)
  expect(readAll()).toBe(true)
  expect(said.slice(-2)).toEqual(['测试修好了，等你确认', 'Fixed it. 一段代码。'])
  useSpeech.setState({ readAloud: false })
  heardSummary({ key: 'd/s1', text: '又一轮', reply: 'r' }, 'd/s1')
  expect(said).toHaveLength(3) // Read aloud off: nothing said
})

it('a summary that could not be made says why, then the start of the reply', () => {
  heardSummary({ key: 'd/s1', text: null, reply: 'The build is green.', error: '总结失败' }, 'd/s1')
  expect(said).toEqual(['总结失败。The build is green.'])
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
  expect(useSpeech.getState().speaking).toBe(false)
  expect(quiet()).toBe(true) // the tail
  expect(overlapsSpeech(11_500, 13_000)).toBe(true) // began while it spoke, ended after
  vi.setSystemTime(12_000 + TAIL_MS + 1)
  expect(quiet()).toBe(false)
  expect(overlapsSpeech(12_000 + TAIL_MS + 1, 14_000)).toBe(false)
  vi.useRealTimers()
})
