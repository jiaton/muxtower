import { expect, it } from 'vitest'
import { EARLY_MAX_MS, EARLY_PAUSE_MS, Utterance } from './engine'

const FRAME = 512 // samples: 32 ms at 16 kHz, as the VAD reads them
const frame = () => new Float32Array(FRAME)
/** Frames of speech (true) or quiet (false), each as the VAD scored it; what `frame` handed to spot. */
function feed(u: Utterance, plan: [boolean, number][]) {
  const offered: { pcm: Float32Array; at: number }[] = []
  let ms = 0
  for (const [speech, frames] of plan)
    for (let i = 0; i < frames; i++) {
      ms += 32
      const pcm = u.frame(speech ? 0.9 : 0.05, frame())
      if (pcm) offered.push({ pcm, at: ms })
    }
  return offered
}
const ofMs = (ms: number) => Math.ceil(ms / 32)

it('offers a short utterance to the spotter once, when its speaker has paused, lead-in included', () => {
  const u = new Utterance()
  feed(u, [[false, 20]]) // before: the lead-in is kept
  u.start()
  const offered = feed(u, [
    [true, ofMs(500)],
    [false, ofMs(EARLY_PAUSE_MS) + 10],
  ])
  expect(offered).toHaveLength(1)
  expect(offered[0]!.at).toBe((ofMs(500) + ofMs(EARLY_PAUSE_MS)) * 32) // at the pause, not the segment's end
  expect(offered[0]!.pcm.length).toBeGreaterThan((ofMs(500) + ofMs(EARLY_PAUSE_MS)) * FRAME) // with its lead-in
  expect(u.claim(offered[0]!.pcm)).toBe(true)
  expect(u.end()).toBeNull() // the command took all of it: nothing to upload
})

it('never offers a long one, and gives nothing to claim once the speaker went on', () => {
  const long = new Utterance()
  long.start()
  expect(
    feed(long, [
      [true, ofMs(EARLY_MAX_MS) + 5],
      [false, ofMs(1000)],
    ]),
  ).toEqual([])
  expect(long.end()).toBe(0) // all of it for the pipeline

  const on = new Utterance()
  on.start()
  const [offered] = feed(on, [
    [true, ofMs(400)],
    [false, ofMs(EARLY_PAUSE_MS)],
  ])
  feed(on, [[true, 5]]) // "send … it": went on before the spotter answered
  expect(on.claim(offered!.pcm)).toBe(false)
  expect(on.end()).toBe(0)
})

it('after a command it took, leaves what was said next for the pipeline', () => {
  const u = new Utterance()
  u.start()
  const [offered] = feed(u, [
    [true, ofMs(400)],
    [false, ofMs(EARLY_PAUSE_MS)],
  ])
  expect(u.claim(offered!.pcm)).toBe(true)
  feed(u, [
    [true, ofMs(800)],
    [false, ofMs(1000)],
  ])
  expect(u.end()).toBe((ofMs(400) + ofMs(EARLY_PAUSE_MS)) * FRAME) // samples since the speech began
})
