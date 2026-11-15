import { describe, expect, it } from 'vitest'
import { TERM_LINE, rowPx } from './geometry'

describe('rowPx', () => {
  it('is TERM_LINE ems tall, in whole device pixels', () => {
    for (const dpr of [1, 2, 2.6, 3]) {
      for (const size of [10, 11, 12, 13, 14, 16, 18]) {
        const px = rowPx(size, dpr)
        expect(Number.isInteger(Math.round(px * dpr * 1e6) / 1e6)).toBe(true) // tiles with no seam
        expect(Math.abs(px - TERM_LINE * size)).toBeLessThanOrEqual(0.5 / dpr + 1e-9)
      }
    }
  })
})
