import { describe, expect, it } from 'vitest'
import { BOUNCE_MS, FitGuard, KeyboardProofHeight, heldScreen, visibleChars } from './fit-guard'

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

describe('KeyboardProofHeight', () => {
  it('on a touch screen: the soft keyboard never changes the height fitted; a new width does', () => {
    const k = new KeyboardProofHeight()
    expect(k.height(390, 700, true)).toBe(700)
    expect(k.height(390, 380, true)).toBe(700) // keyboard up
    expect(k.height(390, 700, true)).toBe(700) // and down: nothing new to send
    expect(k.height(844, 300, true)).toBe(300) // rotated: fitted once, to its own height
    expect(k.height(844, 330, true)).toBe(330) // taller than seen: fitted
  })
  it('with a mouse: the height as it is', () => {
    const k = new KeyboardProofHeight()
    expect(k.height(1200, 700, false)).toBe(700)
    expect(k.height(1200, 380, false)).toBe(380)
  })
})

describe('heldScreen', () => {
  const full = 'claude> ' + 'output line\n'.repeat(10)
  const cleared = '\x1b[2J\x1b[H   \n\n'
  it('keeps the screen before a fit while the new one is mostly blank, for a while', () => {
    const held = { screen: full, until: 1500 }
    expect(heldScreen(cleared, held, 1000)).toBe(full) // the agent cleared, not painted yet: no black frame
    expect(heldScreen(full + 'x', held, 1100)).toBe(full + 'x') // painted: shown at once
    expect(heldScreen(cleared, held, 1600)).toBe(cleared) // held long enough
    expect(heldScreen(cleared, null, 1000)).toBe(cleared) // no fit going on
  })
  it('counts what a reader would see, not escape codes', () => {
    expect(visibleChars('\x1b[31m\x1b[1m   \x1b[0m\n')).toBe(0)
    expect(visibleChars('\x1b[32mok\x1b[0m done')).toBe(6)
  })
})
