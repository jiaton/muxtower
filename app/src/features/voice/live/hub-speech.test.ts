import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setHubVoice, speak, stopSpeaking, useSpeech } from './speech'

const played: string[] = []
const local: string[] = []
let finishAudio: (() => void) | null = null

beforeEach(() => {
  played.length = 0
  local.length = 0
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: (b: Blob & { label?: string }) => `blob:${b.label}`, revokeObjectURL: () => {} }),
  )
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      paused = false
      constructor(public src: string) {}
      play() {
        played.push(this.src)
        finishAudio = () => this.onended?.()
        return Promise.resolve()
      }
      pause() {
        this.paused = true
      }
    },
  )
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (u: { text: string; onend?: () => void }) => (local.push(u.text), u.onend?.()),
  })
  useSpeech.setState({ speaking: false, note: null })
})
afterEach(() => {
  setHubVoice(null)
  vi.unstubAllGlobals()
})

const blob = (label: string) => Object.assign(new Blob(['mp3']), { label })
const settle = () => new Promise((r) => setTimeout(r, 0))

it("speaks in the hub's voice, the next piece fetched while one plays", async () => {
  const asked: string[] = []
  setHubVoice(async (text) => (asked.push(text), blob(text.slice(0, 4))))
  speak('第一句话。'.repeat(40) + '最后一句。') // more than one piece
  await settle()
  expect(played).toHaveLength(1)
  expect(asked).toHaveLength(2) // the second asked before the first finished
  expect(useSpeech.getState().speaking).toBe(true)
  while (useSpeech.getState().speaking) {
    finishAudio?.()
    await settle()
  }
  expect(played.length).toBe(asked.length)
  expect(local).toEqual([])
})

it("falls back to the phone's voice when the hub does not answer, and says so once", async () => {
  setHubVoice(async () => {
    throw new Error('503')
  })
  speak('部署好了。')
  await settle()
  await settle()
  expect(local).toEqual(['部署好了。'])
  expect(useSpeech.getState().note).toBe("using the phone's voice")
  expect(useSpeech.getState().speaking).toBe(false)
})

it('stop cuts it off', async () => {
  setHubVoice(async (text) => blob(text))
  speak('一句话')
  await settle()
  stopSpeaking()
  expect(useSpeech.getState().speaking).toBe(false)
  finishAudio?.()
  await settle()
  expect(played).toHaveLength(1) // nothing more after stop
})
