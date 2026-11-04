import { describe, expect, it } from 'vitest'
import { featureCells } from './features'

describe('feature cells', () => {
  it('each says what it does in one short line', () => {
    for (const cell of Object.values(featureCells)) {
      expect(cell.title.length).toBeLessThanOrEqual(40)
      expect(cell.text.length).toBeLessThanOrEqual(120)
    }
  })
})
