/**
 * The terminal's painted layer (app/AGENTS.md › Terminal glyphs): what a font cannot draw edge to edge —
 * backgrounds, box drawing (U+2500–257F) and block elements (U+2580–259F) — drawn as shapes in one SVG per
 * row, behind its text, in cell units: a cell is CELL wide and a row ROW tall (JetBrains Mono's advance is
 * 0.6 em and a row 1.5 em, so a unit is about a hundredth of an em either way), stretched to the row's own
 * box. Edges are snapped to device pixels (`crispEdges`), and the row's height is whole device pixels, so
 * shapes meet those of the cell beside and of the row below without a seam. The characters themselves stay
 * in the text, transparent: selecting and copying give them as they are.
 */

export const CELL = 60
export const ROW = 150
const CX = CELL / 2
const CY = ROW / 2
const LIGHT = 8 // a light line: about a pixel at a phone's font size
const HEAVY = 16
const GAP = 12 // a double line's two strokes: their centres this far either side of the middle
// What touches a row's top or bottom reaches this far past it (about half a device pixel at 1x): a row's
// edge may fall inside a device pixel (the view's padding), where two rows' shapes would each round away
// from it and leave a hairline; overlapping, the next row's drawn over the edge instead.
const BLEED = 5

type Prim =
  | { k: 'r'; x: number; y: number; w: number; h: number; o?: number } // a rectangle
  | { k: 'p'; d: string; t: number } // a line along a path, `t` thick
  | { k: 'f'; d: string } // a filled path (Powerline's triangles and half circles)

/** Whether a character is painted (its text then drawn transparent): box drawing and blocks (U+2500–259F),
 *  sextants (U+1FB00–1FB3B), the eighth blocks of Symbols for Legacy Computing (U+1FB70–1FB8B) and
 *  Powerline's separators (U+E0B0–E0BF). */
export const isPainted = (code: number) =>
  (code >= 0x2500 && code <= 0x259f) ||
  (code >= 0x1fb00 && code <= 0x1fb3b) ||
  (code >= 0x1fb70 && code <= 0x1fb8b) ||
  (code >= 0xe0b0 && code <= 0xe0bf)

/** The same, for a whole string: whether any of it is painted (a quick test before looking closer). */
export const PAINTED = /[\u2500-\u259f\u{1fb00}-\u{1fb3b}\u{1fb70}-\u{1fb8b}\ue0b0-\ue0bf]/u

// Box drawing's arms, up · right · down · left: 0 none, 1 light, 2 heavy, 3 double; for U+2500–254B and
// U+2550–256C (Unicode's own order), then the half lines U+2574–257F.
const ARMS_A =
  '0101 0202 1010 2020 0101 0202 1010 2020 0101 0202 1010 2020 0110 0210 0120 0220 0011 0012 0021 0022 1100 1200 2100 2200 ' +
  '1001 1002 2001 2002 1110 1210 2110 1120 2120 2210 1220 2220 1011 1012 2011 1021 2021 2012 1022 2022 0111 0112 0211 0212 ' +
  '0121 0122 0221 0222 1101 1102 1201 1202 2101 2102 2201 2202 1111 1112 1211 1212 2111 1121 2121 2112 2211 1122 1221 2212 ' +
  '1222 2122 2221 2222 0101 0202 1010 2020'
const ARMS_B =
  '0303 3030 0310 0130 0330 0013 0031 0033 1300 3100 3300 1003 3001 3003 1310 3130 3330 1013 3031 3033 0313 0131 0333 1303 ' +
  '3101 3303 1313 3131 3333'
const ARMS_C = '0001 1000 0100 0010 0002 2000 0200 0020 0201 1020 0102 2010'
const arms = (table: string) => table.split(' ').map((a) => [...a].map(Number) as Arms)
type Arms = [number, number, number, number]
const BOX_A = arms(ARMS_A) // U+2500–254F (the last four: double dashes)
const BOX_B = arms(ARMS_B) // U+2550–256C
const BOX_C = arms(ARMS_C) // U+2574–257F
/** Dashes per cell of the dashed lines (U+2504–250B, U+254C–254F). */
const dashes = (code: number) =>
  code >= 0x2504 && code <= 0x250b ? (code <= 0x2507 ? 3 : 4) : code >= 0x254c && code <= 0x254f ? 2 : 0

const thick = (w: number) => (w === 2 ? HEAVY : LIGHT)

/** A box-drawing character's arms as rectangles, joined at the middle (a double line's corners closed
 *  outside, open inside, as a frame's are drawn). */
function armsShape([up, right, down, left]: Arms, dash: number): Prim[] {
  const out: Prim[] = []
  const vMax = Math.max(up === 3 ? 0 : up && thick(up), down === 3 ? 0 : down && thick(down))
  const hMax = Math.max(left === 3 ? 0 : left && thick(left), right === 3 ? 0 : right && thick(right))
  const hDouble = left === 3 || right === 3
  const vDouble = up === 3 || down === 3
  const anyV = up || down
  const anyH = left || right
  const span = (from: number, to: number) => [Math.min(from, to), Math.abs(to - from)] as const
  // Horizontal arms: dir +1 right, -1 left; `end` the cell's edge.
  for (const [w, dir] of [
    [right, 1],
    [left, -1],
  ] as const) {
    if (!w) continue
    const end = dir > 0 ? CELL : 0
    if (w === 3) {
      // Each stroke stops where the vertical one beside it begins: inside a corner, short; outside, long.
      for (const side of [-1, 1] as const) {
        const near = side < 0 ? up : down // the vertical arm on this stroke's side
        const far = side < 0 ? down : up
        const start =
          near === 3 ? CX + dir * GAP : near ? CX - (dir * LIGHT) / 2 : far === 3 ? CX - dir * GAP : far ? CX - (dir * LIGHT) / 2 : CX
        const [x, wd] = span(start, end)
        out.push({ k: 'r', x, y: CY + side * GAP - LIGHT / 2, w: wd, h: LIGHT })
      }
    } else {
      const t = thick(w)
      const through = dir > 0 ? left : right // a line that goes on beyond the middle crosses a double one
      const start = vDouble && !through ? CX + dir * GAP : CX - (dir * Math.max(vMax, anyV ? 0 : t)) / 2
      const [x, wd] = span(start, end)
      out.push({ k: 'r', x, y: CY - t / 2, w: wd, h: t })
    }
  }
  for (const [w, dir] of [
    [down, 1],
    [up, -1],
  ] as const) {
    if (!w) continue
    const end = dir > 0 ? ROW : 0
    if (w === 3) {
      for (const side of [-1, 1] as const) {
        const near = side < 0 ? left : right
        const far = side < 0 ? right : left
        const start =
          near === 3 ? CY + dir * GAP : near ? CY - (dir * LIGHT) / 2 : far === 3 ? CY - dir * GAP : far ? CY - (dir * LIGHT) / 2 : CY
        const [y, ht] = span(start, end)
        out.push({ k: 'r', x: CX + side * GAP - LIGHT / 2, y, w: LIGHT, h: ht })
      }
    } else {
      const t = thick(w)
      const through = dir > 0 ? up : down
      const start = hDouble && !through ? CY + dir * GAP : CY - (dir * Math.max(hMax, anyH ? 0 : t)) / 2
      const [y, ht] = span(start, end)
      out.push({ k: 'r', x: CX - t / 2, y, w: t, h: ht })
    }
  }
  return dash ? dashed(out, dash, !!(left || right)) : out
}

/** A straight line cut into `n` dashes (the gaps a third of each step). */
function dashed(prims: Prim[], n: number, horizontal: boolean): Prim[] {
  const out: Prim[] = []
  for (const p of prims) {
    if (p.k !== 'r') continue
    const length = horizontal ? CELL : ROW
    const step = length / n
    for (let i = 0; i < n; i++) {
      const from = i * step + step / 6
      const size = (step * 2) / 3
      out.push(horizontal ? { ...p, x: from, w: size } : { ...p, y: from, h: size })
    }
  }
  return out
}

/** A rounded corner (╭╮╯╰): an arc from one arm to the other. */
function arc(code: number): Prim[] {
  const r = CX
  const paths: Record<number, string> = {
    0x256d: `M${CX} ${ROW}V${CY + r}A${r} ${r} 0 0 1 ${CX + r} ${CY}H${CELL}`,
    0x256e: `M0 ${CY}H${CX - r}A${r} ${r} 0 0 1 ${CX} ${CY + r}V${ROW}`,
    0x256f: `M${CX} 0V${CY - r}A${r} ${r} 0 0 1 ${CX - r} ${CY}H0`,
    0x2570: `M${CELL} ${CY}H${CX + r}A${r} ${r} 0 0 1 ${CX} ${CY - r}V0`,
  }
  return [{ k: 'p', d: paths[code]!, t: LIGHT }]
}

const quarter = (x: number, y: number): Prim => ({ k: 'r', x: x * CX, y: y * CY, w: CX, h: CY })
const QUADRANTS: Record<number, [number, number][]> = {
  0x2596: [[0, 1]],
  0x2597: [[1, 1]],
  0x2598: [[0, 0]],
  0x2599: [[0, 0], [0, 1], [1, 1]],
  0x259a: [[0, 0], [1, 1]],
  0x259b: [[0, 0], [1, 0], [0, 1]],
  0x259c: [[0, 0], [1, 0], [1, 1]],
  0x259d: [[1, 0]],
  0x259e: [[1, 0], [0, 1]],
  0x259f: [[1, 0], [0, 1], [1, 1]],
} // prettier-ignore

/** A block element: rectangles (eighths, halves, quadrants), or the whole cell at a shade's strength. */
function block(code: number): Prim[] {
  const e = (n: number, of: number) => (of * n) / 8
  if (code === 0x2580) return [{ k: 'r', x: 0, y: 0, w: CELL, h: CY }]
  if (code >= 0x2581 && code <= 0x2588) {
    const h = e(code - 0x2580, ROW)
    return [{ k: 'r', x: 0, y: ROW - h, w: CELL, h }]
  }
  if (code >= 0x2589 && code <= 0x258f) return [{ k: 'r', x: 0, y: 0, w: e(0x2590 - code, CELL), h: ROW }]
  if (code === 0x2590) return [{ k: 'r', x: CX, y: 0, w: CX, h: ROW }]
  if (code >= 0x2591 && code <= 0x2593) return [{ k: 'r', x: 0, y: 0, w: CELL, h: ROW, o: (code - 0x2590) / 4 }]
  if (code === 0x2594) return [{ k: 'r', x: 0, y: 0, w: CELL, h: e(1, ROW) }]
  if (code === 0x2595) return [{ k: 'r', x: e(7, CELL), y: 0, w: e(1, CELL), h: ROW }]
  return (QUADRANTS[code] ?? []).map(([x, y]) => quarter(x, y))
}

/** A sextant (U+1FB00–1FB3B): a cell in two columns and three rows, every pattern but those that are
 *  other characters already (none, the left column ▌, the right ▐, all █). Bit 0 top left, 1 top right,
 *  2 middle left … 5 bottom right. */
function sextant(code: number): Prim[] {
  let bits = code - 0x1fb00 + 1
  if (bits >= 21) bits++
  if (bits >= 42) bits++
  const out: Prim[] = []
  for (let i = 0; i < 6; i++) {
    if (!(bits & (1 << i))) continue
    const y0 = Math.round(((i >> 1) * ROW) / 3)
    const y1 = Math.round((((i >> 1) + 1) * ROW) / 3)
    out.push({ k: 'r', x: (i & 1) * CX, y: y0, w: CX, h: y1 - y0 })
  }
  return out
}

/** Symbols for Legacy Computing's eighth blocks (U+1FB70–1FB8B). */
function eighth(code: number): Prim[] {
  const v = (k: number, n = 1): Prim => ({ k: 'r', x: (CELL * k) / 8, y: 0, w: (CELL * n) / 8, h: ROW })
  const h = (k: number, n = 1): Prim => ({ k: 'r', x: 0, y: (ROW * k) / 8, w: CELL, h: (ROW * n) / 8 })
  if (code <= 0x1fb75) return [v(code - 0x1fb70 + 1)] // a vertical eighth, the 2nd to the 7th
  if (code <= 0x1fb7b) return [h(code - 0x1fb76 + 1)] // a horizontal one
  const corner: Record<number, Prim[]> = {
    0x1fb7c: [v(0), h(7)],
    0x1fb7d: [v(0), h(0)],
    0x1fb7e: [v(7), h(0)],
    0x1fb7f: [v(7), h(7)],
    0x1fb80: [h(0), h(7)],
    0x1fb81: [h(0), h(2), h(4), h(7)],
  }
  if (corner[code]) return corner[code]!
  if (code <= 0x1fb86) return [h(0, [2, 3, 5, 6, 7][code - 0x1fb82]!)] // upper quarter … upper seven eighths
  return [v(8 - [2, 3, 5, 6, 7][code - 0x1fb87]!, [2, 3, 5, 6, 7][code - 0x1fb87]!)] // right quarter … seven eighths
}

/** Powerline's separators (U+E0B0–E0BF): solid triangles and half circles, and their outlines. They span
 *  the row and a little past it (`BLEED`), as a background does, so a bar of them has no seam. */
function powerline(code: number): Prim[] {
  const T = -BLEED
  const B = ROW + BLEED
  const solid: Record<number, string> = {
    0xe0b0: `M0 ${T}L${CELL} ${CY}L0 ${B}Z`,
    0xe0b2: `M${CELL} ${T}L0 ${CY}L${CELL} ${B}Z`,
    0xe0b4: `M0 ${T}A${CELL} ${CY + BLEED} 0 0 1 0 ${B}Z`,
    0xe0b6: `M${CELL} ${T}A${CELL} ${CY + BLEED} 0 0 0 ${CELL} ${B}Z`,
    0xe0b8: `M0 ${T}L0 ${B}L${CELL} ${B}Z`,
    0xe0ba: `M${CELL} ${T}L${CELL} ${B}L0 ${B}Z`,
    0xe0bc: `M0 ${T}L${CELL} ${T}L0 ${B}Z`,
    0xe0be: `M0 ${T}L${CELL} ${T}L${CELL} ${B}Z`,
  }
  const line: Record<number, string> = {
    0xe0b1: `M0 0L${CELL} ${CY}L0 ${ROW}`,
    0xe0b3: `M${CELL} 0L0 ${CY}L${CELL} ${ROW}`,
    0xe0b5: `M0 0A${CELL} ${CY} 0 0 1 0 ${ROW}`,
    0xe0b7: `M${CELL} 0A${CELL} ${CY} 0 0 0 ${CELL} ${ROW}`,
    0xe0b9: `M0 0L${CELL} ${ROW}`,
    0xe0bb: `M${CELL} 0L0 ${ROW}`,
    0xe0bd: `M0 ${ROW}L${CELL} 0`,
    0xe0bf: `M0 0L${CELL} ${ROW}`,
  }
  return solid[code] ? [{ k: 'f', d: solid[code]! }] : line[code] ? [{ k: 'p', d: line[code]!, t: LIGHT }] : []
}

function shape(code: number): Prim[] {
  if (code >= 0xe0b0 && code <= 0xe0bf) return powerline(code)
  if (code >= 0x1fb70) return eighth(code)
  if (code >= 0x1fb00) return sextant(code)
  if (code >= 0x2580) return block(code)
  if (code >= 0x256d && code <= 0x2570) return arc(code)
  if (code >= 0x2571 && code <= 0x2573) {
    const rising: Prim = { k: 'p', d: `M0 ${ROW}L${CELL} 0`, t: LIGHT }
    const falling: Prim = { k: 'p', d: `M0 0L${CELL} ${ROW}`, t: LIGHT }
    return code === 0x2571 ? [rising] : code === 0x2572 ? [falling] : [rising, falling]
  }
  const arms =
    code < 0x2550 ? BOX_A[code - 0x2500] : code <= 0x256c ? BOX_B[code - 0x2550] : code >= 0x2574 ? BOX_C[code - 0x2574] : undefined
  return arms ? armsShape(arms, dashes(code)) : []
}

const shapes = new Map<number, Prim[]>()
const shapeOf = (code: number) => {
  let found = shapes.get(code)
  if (!found) shapes.set(code, (found = shape(code)))
  return found
}

const n = (v: number) => Math.round(v * 100) / 100

/** A rectangle's top and height, reaching past the row's edges it touches (`BLEED`). */
function bled(y: number, h: number): [number, number] {
  const top = y <= 0 ? y - BLEED : y
  const bottom = y + h >= ROW ? y + h + BLEED : y + h
  return [top, bottom - top]
}

/** One row's painting, built cell by cell, then written as an SVG. */
export class Painter {
  private fills = new Map<string, string[]>() // colour → its shapes
  private strokes = new Map<string, string[]>()
  private shapes = new Map<string, string[]>() // filled paths: smooth edges
  private bgs: { from: number; to: number; color: string }[] = []

  /** A background under `cells` cells from column `col` (one run: merged with the run before when the
   *  same colour goes on). */
  background(col: number, cells: number, color: string) {
    const last = this.bgs.at(-1)
    if (last && last.to === col && last.color === color) last.to = col + cells
    else this.bgs.push({ from: col, to: col + cells, color })
  }

  /** A painted character in column `col`, in `color` over `ground` (a shade is the two mixed: solid, so
   *  where rows overlap at their edges it stays the same). */
  glyph(col: number, code: number, color: string, ground: string) {
    for (const p of shapeOf(code)) {
      const x0 = col * CELL
      if (p.k === 'r') {
        const [y, h] = bled(p.y, p.h)
        const at = `<rect x="${n(x0 + p.x)}" y="${n(y)}" width="${n(p.w)}" height="${n(h)}"/>`
        const fill = p.o ? `color-mix(in srgb, ${color} ${p.o * 100}%, ${ground})` : color
        const list = this.fills.get(fill) ?? []
        list.push(at)
        this.fills.set(fill, list)
      } else if (p.k === 'f') {
        const list = this.shapes.get(color) ?? []
        list.push(`<path transform="translate(${x0} 0)" d="${p.d}"/>`)
        this.shapes.set(color, list)
      } else {
        const list = this.strokes.get(color) ?? []
        list.push(`<path transform="translate(${x0} 0)" d="${p.d}" stroke-width="${p.t}"/>`)
        this.strokes.set(color, list)
      }
    }
  }

  get empty() {
    return !this.bgs.length && !this.fills.size && !this.strokes.size && !this.shapes.size
  }

  /** The SVG, `cells` wide; '' when there is nothing to paint. */
  svg(cells: number): string {
    if (this.empty) return ''
    let body = ''
    for (const b of this.bgs)
      body += `<rect x="${b.from * CELL}" y="${-BLEED}" width="${(b.to - b.from) * CELL}" height="${ROW + 2 * BLEED}" style="fill:${b.color}"/>`
    for (const [color, list] of this.fills) body += `<g style="fill:${color}">${list.join('')}</g>`
    for (const [color, list] of this.shapes)
      body += `<g style="fill:${color}" shape-rendering="geometricPrecision">${list.join('')}</g>`
    for (const [color, list] of this.strokes)
      body += `<g style="fill:none;stroke:${color}" shape-rendering="geometricPrecision">${list.join('')}</g>`
    const width = Math.max(cells, ...this.bgs.map((b) => b.to))
    return `<svg class="term-paint" aria-hidden="true" viewBox="0 0 ${width * CELL} ${ROW}" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:${width}ch">${body}</svg>`
  }
}
