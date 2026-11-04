import { describe, expect, it } from 'vitest'
import { ScreenBases, applyPatch } from './screen-patch'

describe('screen patches', () => {
  it('puts the next screen together from the one it builds on', () => {
    expect(applyPatch(['a', 'b', 'c', 'd'], [[1, 2], 'new', [3, 1]])).toEqual(['b', 'c', 'new', 'd'])
    expect(applyPatch(['a'], [[0, 2]])).toBeNull() // lines that are not there
  })

  it('builds only on the screen kept; anything else asks for a whole one', () => {
    const bases = new ScreenBases()
    bases.whole('s1', 'a\nb\nc', 7)
    expect(bases.patch('s1', 7, 8, [[0, 3], 'd'])).toBe('a\nb\nc\nd')
    expect(bases.patch('s1', 8, 9, [[0, 4], 'e'])).toBe('a\nb\nc\nd\ne')
    expect(bases.patch('s1', 5, 10, [[0, 1]])).toBeNull() // a screen missed: subscribe again
    expect(bases.patch('s1', 9, 10, [[0, 1]])).toBeNull() // and nothing to build on until a whole one comes
  })

  it('takes a whole screen without a number as it is: a daemon that sends no patches', () => {
    const bases = new ScreenBases()
    bases.whole('s1', 'a\nb', null)
    expect(bases.patch('s1', 1, 2, [[0, 1]])).toBeNull()
  })
})
