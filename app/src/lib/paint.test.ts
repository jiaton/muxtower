import { describe, expect, it } from 'vitest'
import { CELL, Painter, ROW, isPainted } from './paint'

/** The rectangles one character paints, as numbers (x, y, width, height), in cell units. */
function rects(code: number, ground = 'black'): number[][] {
  const painter = new Painter()
  painter.glyph(0, code, 'white', ground)
  const svg = painter.svg(1)
  return [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)].map((m) =>
    m.slice(1).map(Number),
  )
}

describe('the painted layer', () => {
  it('paints every box-drawing, block, sextant, legacy eighth and Powerline character, and nothing else', () => {
    const ranges = [
      [0x2500, 0x259f],
      [0x1fb00, 0x1fb3b],
      [0x1fb70, 0x1fb8b],
      [0xe0b0, 0xe0bf],
    ]
    for (const code of ranges.flatMap(([from, to]) => Array.from({ length: to! - from! + 1 }, (_, i) => from! + i))) {
      const painter = new Painter()
      painter.glyph(0, code, 'white', 'black')
      expect(painter.empty, `U+${code.toString(16)}`).toBe(false)
    }
    expect(isPainted(0x24ff)).toBe(false)
    expect(isPainted(0x1fb3c)).toBe(false) // the diagonal ones are not (yet)
    expect(isPainted(0xe0c0)).toBe(false)
    expect(isPainted(0x25a0)).toBe(false)
  })

  it('draws a cross as four arms meeting in the middle, out to the cell’s edges and the row’s (bled past them)', () => {
    const cross = rects(0x253c) // ┼
    expect(cross).toHaveLength(4)
    expect(Math.min(...cross.map(([x]) => x!))).toBe(0)
    expect(Math.max(...cross.map(([x, , w]) => x! + w!))).toBe(CELL)
    expect(Math.min(...cross.map(([, y]) => y!))).toBeLessThan(0) // past the row's top: no hairline between rows
    expect(Math.max(...cross.map(([, y, , h]) => y! + h!))).toBeGreaterThan(ROW)
  })

  it('draws double lines as two strokes, closed outside a corner and open inside it', () => {
    expect(rects(0x2550)).toHaveLength(4) // ═: two strokes per arm
    expect(rects(0x256c)).toHaveLength(8) // ╬
    const corner = rects(0x2554) // ╔: the outer stroke reaches back past the inner one
    const horizontal = corner.filter(([, , w, h]) => w! > h!)
    const [outer, inner] = horizontal.sort((a, b) => a[1]! - b[1]!)
    expect(outer![0]).toBeLessThan(inner![0]!)
  })

  it('draws blocks as rectangles and shades as one solid colour (no overlap shows where rows meet)', () => {
    expect(rects(0x2588)[0]!.slice(0, 1)).toEqual([0]) // █ from the left edge
    expect(rects(0x2580)[0]![3]).toBeCloseTo(ROW / 2 + 5) // ▀ the upper half (bled above)
    const painter = new Painter()
    painter.glyph(0, 0x2592, 'white', 'black') // ▒
    expect(painter.svg(1)).toContain('color-mix(in srgb, white 50%, black)')
    expect(painter.svg(1)).not.toContain('opacity')
  })

  it('draws a sextant’s six parts by its place in Unicode (skipping the patterns that are other blocks)', () => {
    const parts = (code: number) =>
      rects(code)
        .map(([x, y]) => `${x! < CELL / 2 ? 'L' : 'R'}${Math.round(((y! + 5) / ROW) * 3)}`)
        .sort()
    expect(parts(0x1fb00)).toEqual(['L0']) // 🬀 top left
    expect(parts(0x1fb02)).toEqual(['L0', 'R0']) // 🬂 the top third
    expect(parts(0x1fb0b)).toEqual(['L1', 'R1']) // 🬋 the middle third
    expect(parts(0x1fb13)).toEqual(['L1', 'L2']) // pattern 20
    expect(parts(0x1fb14)).toEqual(['L1', 'L2', 'R0']) // pattern 22: 21 (the left column, ▌) is not a sextant
    expect(parts(0x1fb3b)).toEqual(['L1', 'L2', 'R0', 'R1', 'R2']) // pattern 62, the last
  })

  it('merges a background run by run into one rectangle per colour stretch', () => {
    const painter = new Painter()
    painter.background(0, 3, 'red')
    painter.background(3, 2, 'red')
    painter.background(5, 1, 'blue')
    const svg = painter.svg(6)
    expect(svg.match(/<rect/g)).toHaveLength(2)
    expect(svg).toContain(`width="${5 * CELL}"`)
  })
})
