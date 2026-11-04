import { describe, expect, it } from 'vitest'
import { usageRows } from './usage'

describe('usage rows', () => {
  it('alert only over a limit (20% CPU, 200 ms a round, 500 MB)', () => {
    for (const row of usageRows) {
      const over = row.cpu1m > 20 || row.tickMs > 200 || row.rssMb > 500
      expect(Boolean(row.alert)).toBe(over)
    }
  })
})
