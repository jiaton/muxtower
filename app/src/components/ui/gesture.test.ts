import { describe, expect, it } from 'vitest'
import { LAND_EASE, landCurve, landMs } from './gesture'

describe('landCurve', () => {
  const slope = (ease: string) => {
    const [x1, y1] = ease
      .match(/cubic-bezier\(([^)]*)\)/)![1]!
      .split(',')
      .map(Number)
    return y1! / x1! // the curve's first slope, in progress per unit of time
  }

  it("starts at the finger's speed and takes the time that speed needs, within bounds", () => {
    const { ms, ease } = landCurve(150, 1) // 150 px left to go at 1 px/ms
    expect(ms).toBe(150)
    expect(slope(ease) * (150 / ms)).toBeCloseTo(1, 2) // first slope × average speed = the finger's speed
    expect(landCurve(150, 10).ms).toBe(120) // a fast flick: no shorter than this
    expect(landCurve(600, 1).ms).toBe(300) // a long way: no longer than this
    expect(slope(landCurve(600, 0.4).ease) * (600 / 300)).toBeGreaterThanOrEqual(0.4) // never slower than the finger
    expect(landCurve(118, 0.43).ms).toBe(274) // an unhurried swipe carries on as it was
  })

  it('works the same either way (a close lands toward negative x)', () => {
    expect(landCurve(-150, -1)).toEqual(landCurve(150, 1))
  })

  it('lets a stopped or contrary release land briskly, easing out (never in)', () => {
    expect(landCurve(150, 0.1)).toEqual({ ms: landMs(150, 0.1), ease: LAND_EASE })
    expect(landCurve(150, -1)).toEqual({ ms: landMs(150, -1), ease: LAND_EASE })
  })
})
