import { describe, expect, it } from 'vitest'
import { IDLE_MS, STEP_PX, sidewaysWheel } from './sideways-wheel'

const feed = (model: ReturnType<typeof sidewaysWheel>, events: [dx: number, dy: number, at: number, shift?: boolean][]) =>
  events.map(([dx, dy, at, shift = false]) => model.feed({ dx, dy, at, shift }))

describe('sidewaysWheel', () => {
  it('steps once the sideways movement passes about a notch, not before', () => {
    const m = sidewaysWheel()
    expect(feed(m, [[40, 0, 0], [40, 0, 10], [STEP_PX - 80, 0, 20]])).toEqual([0, 0, 1])
  })

  it('steps back for a wheel to the left', () => {
    expect(feed(sidewaysWheel(), [[-120, 0, 0]])).toEqual([-1])
  })

  it('steps once per gesture: a long swipe and its momentum step only once', () => {
    const m = sidewaysWheel()
    const swipe = Array.from({ length: 40 }, (_, i) => [30, 0, i * 16] as [number, number, number])
    expect(feed(m, swipe).filter(Boolean)).toEqual([1])
  })

  it('steps again once the wheel rested', () => {
    const m = sidewaysWheel()
    expect(feed(m, [[120, 0, 0], [120, 0, IDLE_MS - 1], [120, 0, 2 * IDLE_MS - 2], [120, 0, 3 * IDLE_MS + 10]])).toEqual([1, 0, 0, 1])
  })

  it('never steps for a slanted scroll', () => {
    const m = sidewaysWheel()
    const slant = Array.from({ length: 30 }, (_, i) => [20, 12, i * 16] as [number, number, number])
    expect(feed(m, slant).filter(Boolean)).toEqual([])
    expect(feed(sidewaysWheel(), [[120, 61, 0]])).toEqual([0]) // not more than twice
    expect(feed(sidewaysWheel(), [[120, 59, 0]])).toEqual([1])
  })

  it('never steps for a vertical wheel', () => {
    expect(feed(sidewaysWheel(), [[0, 300, 0], [0, 300, 10]])).toEqual([0, 0])
  })

  it('takes Shift and the vertical wheel as sideways, also when the browser hands it over as deltaX', () => {
    expect(feed(sidewaysWheel(), [[0, 120, 0, true]])).toEqual([1])
    expect(feed(sidewaysWheel(), [[0, -120, 0, true]])).toEqual([-1])
    expect(feed(sidewaysWheel(), [[120, 0, 0, true]])).toEqual([1])
  })
})
