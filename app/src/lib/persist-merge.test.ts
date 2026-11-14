import { describe, expect, it } from 'vitest'
import { mergeWithDefaults } from './persist-merge'

const defaults = { group: 'status', collapsed: [] as string[], fit: {} as Record<string, boolean>, fontSize: 12, set: () => {} }

describe('mergeWithDefaults', () => {
  it('takes back what was kept, field by field', () => {
    const merged = mergeWithDefaults({ group: 'device', collapsed: ['a'], fit: { s: true }, fontSize: 14 }, defaults)
    expect(merged).toMatchObject({ group: 'device', collapsed: ['a'], fit: { s: true }, fontSize: 14 })
    expect(typeof merged.set).toBe('function') // never replaced by what was kept
  })
  it('an older shape, a missing field or one this version dropped: the default', () => {
    const merged = mergeWithDefaults({ collapsed: 'a', fit: ['x'], fontSize: '14', keypad: true }, defaults)
    expect(merged.collapsed).toEqual([])
    expect(merged.fit).toEqual({})
    expect(merged.fontSize).toBe(12)
    expect(merged.group).toBe('status')
    expect('keypad' in merged).toBe(false)
  })
  it('nothing usable kept: the defaults', () => {
    for (const kept of [null, undefined, 'x', 3, []]) expect(mergeWithDefaults(kept, defaults)).toEqual(defaults)
  })
})
