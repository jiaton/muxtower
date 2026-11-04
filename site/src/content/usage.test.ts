import { describe, expect, it } from 'vitest'
import { figures, usageRows } from './usage'

describe('usage rows', () => {
  it('alert only over a limit (20% CPU, 200 ms a round, 500 MB)', () => {
    for (const row of usageRows) {
      const over = row.cpu1m > 20 || row.tickMs > 200 || row.rssMb > 500
      expect(Boolean(row.alert)).toBe(over)
    }
  })
})

describe('figures', () => {
  it('are distinct, short, and each explained', () => {
    const shown = figures.map((f) => f.figure)
    expect(new Set(shown).size).toBe(shown.length)
    for (const f of figures) {
      expect(f.figure.length).toBeLessThanOrEqual(6)
      expect(f.text.length).toBeLessThanOrEqual(70)
    }
  })
})
