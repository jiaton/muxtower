import { describe, expect, it } from 'vitest'
import { NO_CHIP, stepChip } from './chip-switch'

const ids = ['product', 'ops', 'pms']

describe('stepChip', () => {
  it('goes from no chip to the first, along the row in its order', () => {
    expect(stepChip(ids, undefined, 1)).toBe('product')
    expect(stepChip(ids, 'product', 1)).toBe('ops')
    expect(stepChip(ids, 'ops', -1)).toBe('product')
    expect(stepChip(ids, 'product', -1)).toBe(NO_CHIP)
  })

  it('does nothing past either end (no wrapping)', () => {
    expect(stepChip(ids, undefined, -1)).toBeNull()
    expect(stepChip(ids, 'pms', 1)).toBeNull()
  })

  it('counts a chip the row does not show as no chip', () => {
    expect(stepChip(ids, 'gone', 1)).toBe('product')
    expect(stepChip(ids, 'gone', -1)).toBeNull()
  })

  it('has nothing to step to without chips', () => {
    expect(stepChip([], undefined, 1)).toBeNull()
  })
})
