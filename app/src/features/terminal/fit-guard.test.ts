import { describe, expect, it } from 'vitest'
import { BOUNCE_MS, FitGuard } from './fit-guard'

describe('FitGuard', () => {
  it('sends a new size, never the same one again, nor one a couple of rows off', () => {
    const g = new FitGuard()
    expect(g.allow({ cols: 117, rows: 126 }, 0)).toBe(true)
    expect(g.allow({ cols: 117, rows: 126 }, 100)).toBe(false)
    expect(g.allow({ cols: 117, rows: 124 }, 200)).toBe(false)
    expect(g.allow({ cols: 90, rows: 126 }, 300)).toBe(true) // really resized
  })
  it('does not bounce back to the size before (A, B, A) within a while', () => {
    const g = new FitGuard()
    expect(g.allow({ cols: 117, rows: 126 }, 0)).toBe(true)
    expect(g.allow({ cols: 115, rows: 126 }, 500)).toBe(true) // a scrollbar came
    expect(g.allow({ cols: 117, rows: 126 }, 1000)).toBe(false) // and went: not again
    expect(g.allow({ cols: 117, rows: 126 }, 1000 + BOUNCE_MS)).toBe(true) // much later: a real change
  })
})
