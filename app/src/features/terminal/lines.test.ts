import { describe, expect, it } from 'vitest'
import { align, collapseGap } from './lines'

const lines = (...xs: string[]) => xs

describe('align', () => {
  it('detects output pushing lines off the top', () => {
    expect(align(lines('a', 'b', 'c', 'd', 'e'), lines('c', 'd', 'e', 'f', 'g'))).toEqual({ removeTop: 2, insertTop: 0 })
  })

  it('detects older history added on top', () => {
    expect(align(lines('c', 'd', 'e'), lines('a', 'b', 'c', 'd', 'e', 'f'))).toEqual({ removeTop: 0, insertTop: 2 })
  })

  it('treats a redraw in place as no shift', () => {
    expect(align(lines('a', 'b', 'c'), lines('a', 'b', 'x'))).toEqual({ removeTop: 0, insertTop: 0 })
  })
})

describe('collapseGap', () => {
  const lines = (spec: string) => spec.split('').map((c) => (c === '.' ? '' : c))
  const shown = (out: string[]) => out.map((l) => l || '.').join('')

  it('leaves a pane no taller than the view alone, history included (1x)', () => {
    expect(shown(collapseGap(lines('h...p'), 5, 15))).toBe('h...p')
    expect(shown(collapseGap(lines('x......yh...p'), 5, 5))).toBe('x......yh...p') // 1x: never
  })

  it('shortens the blank middle of its screen until it fits, keeping one blank line at least', () => {
    expect(shown(collapseGap(lines('h........p'), 4, 10))).toBe('h..p')
    expect(shown(collapseGap(lines('h........p'), 2, 10))).toBe('h.p') // as far as it goes
  })

  it('shortens only the longest run, and only in the pane, not the history above it', () => {
    expect(shown(collapseGap(lines('a..b.....c'), 6, 10))).toBe('a..b.c')
    expect(shown(collapseGap(lines('o......oh....p'), 4, 6))).toBe('o......oh..p') // the 6 above: history
  })

  it('counts a line of styled spaces as blank', () => {
    const styled = ['<b>header</b>', '<span class="x">   </span>', '<span>&nbsp;</span>', '', 'prompt']
    expect(collapseGap(styled, 3, 5)).toEqual(['<b>header</b>', '', 'prompt'])
  })
})

describe('collapseGap is cheap', () => {
  it('takes well under a millisecond for a 4-screen pane 200 columns wide, full of output', () => {
    const viewRows = 50
    const cell = '<span class="fg-2">x</span>'
    const busy = Array.from({ length: viewRows * 4 }, (_, i) => (i % 9 === 0 ? '' : cell.repeat(200)))
    const gap = [...busy.slice(0, 20), ...Array(80).fill('<span> </span>'), ...busy.slice(0, 100)]
    for (const lines of [busy, gap]) {
      let best = Infinity
      for (let run = 0; run < 5; run++) {
        const start = performance.now()
        collapseGap(lines, viewRows, viewRows * 4)
        best = Math.min(best, performance.now() - start)
      }
      expect(best).toBeLessThan(1)
    }
    const same = collapseGap(busy, viewRows, viewRows)
    expect(same).toBe(busy) // nothing to shorten: the same array, so memo and align see no change
    expect(collapseGap(gap, viewRows, viewRows * 4)).toEqual(collapseGap(gap, viewRows, viewRows * 4)) // stable
  })
})
