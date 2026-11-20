import { describe, expect, it, vi } from 'vitest'
import { useLayoutDrawer } from '@/lib/layout-drawer'
import { useLayoutPrefs } from '@/lib/layout-prefs'
import { BOUNCE_MS, FitGuard, StableHeight, fitLine, frameOf, heldScreen, visibleChars, watchFrame } from './fit-guard'

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
  it('a frame change (full screen in and out) goes back to the size before at once', () => {
    const g = new FitGuard()
    expect(g.allow({ cols: 117, rows: 40 }, 0)).toBe(true)
    expect(g.allow({ cols: 160, rows: 50 }, 500, 'frame')).toBe(true) // full screen
    expect(g.allow({ cols: 117, rows: 40 }, 2000, 'frame')).toBe(true) // and out: fitted back
    expect(g.allow({ cols: 117, rows: 40 }, 2100, 'frame')).toBe(false) // the same size is still never sent twice
  })
})

describe('StableHeight', () => {
  const win = (innerWidth: number, innerHeight: number) => ({ innerWidth, innerHeight })
  it('on a touch screen: the soft keyboard never changes the height fitted; a new width does', () => {
    const k = new StableHeight()
    expect(k.height(frameOf(390, true, win(390, 844)), 700)).toBe(700)
    expect(k.height(frameOf(390, true, win(390, 480)), 380)).toBe(700) // keyboard up (the window shrank too)
    expect(k.height(frameOf(390, true, win(390, 844)), 700)).toBe(700) // and down: nothing new to send
    expect(k.height(frameOf(844, true, win(844, 390)), 300)).toBe(300) // rotated: fitted once
    expect(k.height(frameOf(844, true, win(844, 390), 1), 340)).toBe(340) // full screen: taller
    expect(k.height(frameOf(844, true, win(844, 390), 2), 300)).toBe(300) // and out: shorter again
  })
  it('with a mouse: the Live row, quotes, the + panel or a long draft never change it; the window does', () => {
    const k = new StableHeight()
    const frame = frameOf(900, false, win(1440, 900))
    expect(k.height(frame, 700)).toBe(700)
    expect(k.height(frame, 652)).toBe(700) // Live on: the footer took 48 px
    expect(k.height(frame, 560)).toBe(700) // a quote card, a 5-line draft
    expect(k.height(frame, 700)).toBe(700) // all gone again: nothing to send
    expect(k.height(frameOf(900, false, win(1440, 700)), 500)).toBe(500) // the window made shorter: fitted
    expect(k.height(frameOf(640, false, win(1440, 700)), 500)).toBe(500) // a pane shown beside it (focus mode)
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

describe('watchFrame', () => {
  it('reports the window, full screen, the layout and the drawer; stops when unwatched', () => {
    const seen = vi.fn()
    const unwatch = watchFrame(seen)
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new Event('fullscreenchange'))
    useLayoutPrefs.getState().setLayout('session')
    useLayoutDrawer.getState().setOpen(true)
    useLayoutDrawer.getState().setOpen(false)
    expect(seen.mock.calls.map(([c]) => c)).toEqual(['resize', 'fullscreen', 'layout', 'drawer', 'drawer'])
    unwatch()
    useLayoutPrefs.getState().setLayout('full')
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(seen).toHaveBeenCalledTimes(5)
  })
  it('says why a fit was made', () => {
    expect(fitLine({ cols: 80, rows: 24 }, 'frame', 'fullscreen')).toBe('fitted to 80x24 (frame: fullscreen)')
    expect(fitLine({ cols: 80, rows: 24 }, 'content')).toBe('fitted to 80x24 (content)')
  })
})
