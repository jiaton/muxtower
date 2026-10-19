import { expect, it } from 'vitest'
import type { GlassesPort } from '@/platform/port'
import { createAppStore } from '@/state/store'
import { session } from '@/test/fixtures'
import { Recorder } from './recorder'
import { FRAME_BYTES } from './segmenter'
import { Talk } from './talk'

const port = {
  startAudio: async () => true,
  stopAudio: async () => undefined,
} as unknown as GlassesPort

const pcm = (pattern: string) => {
  const bytes = new Uint8Array(pattern.length * FRAME_BYTES)
  const view = new DataView(bytes.buffer)
  ;[...pattern].forEach((c, f) => {
    for (let i = 0; i < FRAME_BYTES / 2; i++) view.setInt16(f * FRAME_BYTES + i * 2, c === 'x' ? (i % 2 ? 3000 : -3000) : 0, true)
  })
  return bytes
}

function setup() {
  const store = createAppStore()
  const nav = { ...store.getState().nav, stack: [{ screen: 'session' as const, id: 'a' }] }
  store.setState({ sessions: [session('a')], nav, features: { summaries: false, asr: true }, link: 'open' })
  const heard: number[] = []
  const talk = new Talk({
    store,
    recorder: new Recorder(port),
    transcribe: async (wav) => {
      heard.push(wav.length)
      return wav.length > 100_000 ? '让 lyric 继续跑测试' : `piece${heard.length}`
    },
    notify: () => undefined,
  })
  return { store, talk, heard }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

it('shows live text from pauses, then the whole recording transcribed again', async () => {
  const { store, talk } = setup()
  await talk.start('tap')
  expect(store.getState().voice).toMatchObject({ session: 'a', mode: 'tap', phase: 'listening' })
  talk.feed(pcm('xxxxxxxxxx......'))
  talk.feed(pcm('xxxxxxxxxx......'))
  await flush()
  await flush()
  expect(store.getState().voice?.text).toBe('piece1 piece2')
  talk.feed(pcm('x'.repeat(40)))
  await talk.stop()
  expect(store.getState().voice).toMatchObject({ phase: 'ready', text: '让 lyric 继续跑测试' })
})

it('cancelling drops text that arrives afterwards', async () => {
  const { store, talk } = setup()
  await talk.start('hold')
  talk.feed(pcm('xxxxxxxxxx......'))
  store.setState({ voice: null })
  await talk.cancel()
  await flush()
  expect(store.getState().voice).toBeNull()
})
