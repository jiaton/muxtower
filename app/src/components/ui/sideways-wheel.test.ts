import { describe, expect, it } from 'vitest'
import { IDLE_MS, NOTCH_GAP_MS, STEP_PX, sidewaysWheel } from './sideways-wheel'

type Event = [dx: number, dy: number, at: number, shift?: boolean, lines?: boolean]
const feed = (model: ReturnType<typeof sidewaysWheel>, events: Event[]) =>
  events.map(([dx, dy, at, shift = false, lines = false]) => model.feed({ dx, dy, at, shift, lines }))

/** `n` notches of `dx`, `every` ms apart. */
const notches = (n: number, dx: number, every: number, from = 0): Event[] =>
  Array.from({ length: n }, (_, i) => [dx, 0, from + i * every])

/** A trackpad's swipe: small deltas 16 ms apart, rising, then a momentum tail decaying to nothing. */
const trackpad = (way: 1 | -1, from = 0): Event[] => {
  const deltas = [2, 5, 9, 14, 20, 26, 30, 30, 28, 24, 20, 16, 13, 10, 8, 6, 5, 4, 3, 2, 2, 1, 1, 1]
  return deltas.map((d, i) => [way * d, 0, from + i * 16])
}

describe('sidewaysWheel: a notched wheel', () => {
  it('steps once per notch, as it comes, both ways: 40 px notches (Chrome on macOS) 60 ms apart', () => {
    expect(feed(sidewaysWheel(), notches(5, 40, 60))).toEqual([1, 1, 1, 1, 1])
    expect(feed(sidewaysWheel(), notches(5, -40, 60))).toEqual([-1, -1, -1, -1, -1])
  })

  it('steps once per notch of 100 or 120 px (Windows, Linux), and back again in the same gesture', () => {
    expect(feed(sidewaysWheel(), notches(3, 100, 60))).toEqual([1, 1, 1])
    expect(feed(sidewaysWheel(), [...notches(2, 120, 60), ...notches(2, -120, 60, 120)])).toEqual([1, 1, -1, -1])
  })

  it('steps for a notch in lines (Firefox), whatever its pixels come to', () => {
    expect(feed(sidewaysWheel(), [[19, 0, 0, false, true], [19, 0, 60, false, true], [-57, 0, 120, false, true]])).toEqual([1, 1, -1])
  })

  it('takes Shift and the vertical wheel as sideways, also when the browser hands it over as deltaX (macOS)', () => {
    expect(feed(sidewaysWheel(), [[0, 40, 0, true], [0, 40, 60, true], [0, -40, 120, true]])).toEqual([1, 1, -1])
    expect(feed(sidewaysWheel(), [[40, 0, 0, true], [40, 0, 60, true], [-40, 0, 120, true]])).toEqual([1, 1, -1])
    expect(feed(sidewaysWheel(), [[0, 120, 0, true]])).toEqual([1])
  })

  it('counts a notch sent twice, or one that follows within the debounce, once', () => {
    expect(feed(sidewaysWheel(), [[40, 0, 0], [40, 0, NOTCH_GAP_MS - 1], [40, 0, 2 * NOTCH_GAP_MS + 5]])).toEqual([1, 0, 1])
  })

  it('never steps for a vertical notch or a slanted one', () => {
    expect(feed(sidewaysWheel(), [[0, 100, 0], [0, 100, 60], [0, -100, 120]])).toEqual([0, 0, 0])
    expect(feed(sidewaysWheel(), [[120, 61, 0]])).toEqual([0]) // not more than twice
    expect(feed(sidewaysWheel(), [[120, 59, 0]])).toEqual([1])
  })

  it('a hard trackpad flick that starts big still steps only once: its quick small events make it a stream', () => {
    const flick: Event[] = [50, 60, 70, 60, 40, 30, 20, 12, 8, 5, 3, 2, 1].map((d, i) => [d, 0, i * 16])
    expect(feed(sidewaysWheel(), flick)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('sidewaysWheel: a stream (a trackpad, a smooth-scrolling mouse)', () => {
  it('steps once the sideways movement passes STEP_PX, not before', () => {
    const m = sidewaysWheel()
    expect(feed(m, [[20, 0, 0], [20, 0, 16], [20, 0, 32], [20, 0, 48], [STEP_PX - 80, 0, 64]])).toEqual([0, 0, 0, 0, 1])
  })

  it('steps once per gesture: a swipe and its momentum tail step only once, either way', () => {
    expect(feed(sidewaysWheel(), trackpad(1)).filter(Boolean)).toEqual([1])
    expect(feed(sidewaysWheel(), trackpad(-1)).filter(Boolean)).toEqual([-1])
    const swipe = Array.from({ length: 40 }, (_, i) => [30, 0, i * 16] as Event)
    expect(feed(sidewaysWheel(), swipe).filter(Boolean)).toEqual([1])
  })

  it('steps again once the wheel rested IDLE_MS', () => {
    const m = sidewaysWheel()
    const first = trackpad(1)
    const end = first[first.length - 1][2]
    expect(feed(m, [...first, ...trackpad(1, end + IDLE_MS - 1)]).filter(Boolean)).toEqual([1]) // no rest: one gesture
    expect(feed(m, trackpad(1, 10_000)).filter(Boolean)).toEqual([1])
  })

  it('a smooth-scrolling mouse (each notch eased into small pixel steps) counts as a trackpad: one step per gesture', () => {
    // About 60 px a notch, as 10 events 16 ms apart, the notches 200 ms apart: one gesture, so one step,
    // once the notches add up past STEP_PX; then nothing until the wheel rests.
    const eased = (from: number): Event[] => [14, 12, 9, 7, 5, 4, 3, 2, 1, 1].map((d, i) => [d, 0, from + i * 16])
    const steps = feed(sidewaysWheel(), [...eased(0), ...eased(200), ...eased(400), ...eased(600)])
    expect(steps.filter(Boolean)).toEqual([1])
    expect(steps.indexOf(1)).toBeGreaterThanOrEqual(10) // in the second notch, not the first
  })

  it('never steps for a slanted scroll or a vertical one', () => {
    const slant = Array.from({ length: 30 }, (_, i) => [20, 12, i * 16] as Event)
    expect(feed(sidewaysWheel(), slant).filter(Boolean)).toEqual([])
    expect(feed(sidewaysWheel(), [[0, 30, 0], [0, 30, 16]])).toEqual([0, 0])
  })
})
