// The terminal glyph suite: every fixture (src/features/terminal/glyph-fixtures.ts) drawn by the real
// TerminalView at phone and desktop widths and 1×, 2× and 2.6× device pixels, then checked in the
// screenshot: no seam between two solid cells (across a column or a row), no gap along a vertical line,
// and text that ends where its cells do (drift ≤ 0.5 px). A new rendering issue is a new fixture here.
import { expect, test, type Page } from '@playwright/test'
import { FIXTURES, type Fixture } from '../src/features/terminal/glyph-fixtures'

const WIDTHS = [46, 96]
const DPRS = [1, 2, 2.6]
const TOLERANCE = 48 // per channel: antialiasing inside a fill is far below this; a seam is far above
const MAX_DRIFT = 0.5

/** Fixtures known to fail today, expected to (an expected failure that passes fails the run, so one fixed
 *  must come off). Step 2's painted layer cleared logo, frames, blocks, shades and eighths: none left. */
const KNOWN_RED = new Set<string>([])

interface Geometry {
  cw: number
  rows: { left: number; top: number; bottom: number }[]
  drift?: number
}

async function geometry(page: Page, fixture: Fixture, cols: number): Promise<Geometry> {
  return page.evaluate(
    ([driftRow, cols]) => {
      const probe = [...document.querySelectorAll<HTMLElement>('div[aria-hidden]')].find((d) => d.textContent === 'MMMMMMMMMM')!
      const cw = probe.getBoundingClientRect().width / 10
      const rows = [...document.querySelectorAll<HTMLElement>('[role=log] > div:last-child > div')].map((r) => {
        const b = r.getBoundingClientRect()
        return { left: b.left, top: b.top, bottom: b.bottom }
      })
      let drift: number | undefined
      if (driftRow !== null) {
        const row = document.querySelectorAll<HTMLElement>('[role=log] > div:last-child > div')[driftRow]!
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
        let last: Text | null = null
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').includes('X')) last = n as Text
        const range = document.createRange()
        const at = last!.textContent!.lastIndexOf('X')
        range.setStart(last!, at)
        range.setEnd(last!, at + 1)
        drift = Math.abs(range.getBoundingClientRect().right - (row.getBoundingClientRect().left + cols * cw))
      }
      return { cw, rows, drift }
    },
    [fixture.driftRow ?? null, cols] as const,
  )
}

/** Seam pixels and line gaps, read from a screenshot of the page. */
async function inspect(page: Page, fixture: Fixture, g: Geometry, dpr: number) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ([png, fixture, g, dpr, tolerance]) => {
      const img = new Image()
      await new Promise((r) => {
        img.onload = r
        img.src = `data:image/png;base64,${png}`
      })
      const canvas = new OffscreenCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, img.width, img.height).data
      const px = (x: number, y: number) => {
        const i = (Math.round(y * dpr) * img.width + Math.round(x * dpr)) * 4
        return [data[i]!, data[i + 1]!, data[i + 2]!]
      }
      const off = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!))) > tolerance
      const step = 1 / dpr
      const solid = new Map<string, string>() // cell → its fill group: only a neighbour of the same group must meet it
      const spans = new Map<string, [number, number]>() // cell → the part of its row it fills
      for (const s of fixture.solids)
        for (let c = s.from; c <= s.to; c++) {
          solid.set(`${s.row}:${c}`, s.group ?? '')
          spans.set(`${s.row}:${c}`, s.span ?? [0.2, 0.8])
        }
      const same = (key: string, other: string) => solid.get(other) === solid.get(key)
      let seams = 0
      for (const key of solid.keys()) {
        const [r, c] = key.split(':').map(Number) as [number, number]
        const row = g.rows[r]!
        const x0 = row.left + c * g.cw
        const ref = px(x0 + g.cw / 2, (row.top + row.bottom) / 2)
        if (same(key, `${r}:${c + 1}`)) {
          const x = x0 + g.cw
          const [top, bottom] = spans.get(key)!
          for (let y = row.top + (row.bottom - row.top) * top; y < row.top + (row.bottom - row.top) * bottom; y += step)
            for (const dx of [-step, 0]) if (off(px(x + dx, y), ref)) seams++
        }
        if (same(key, `${r + 1}:${c}`)) {
          const y = row.bottom
          for (let x = x0 + g.cw * 0.25; x < x0 + g.cw * 0.75; x += step) for (const dy of [-step, 0]) if (off(px(x, y + dy), ref)) seams++
        }
      }
      let gaps = 0
      const perLine: string[] = []
      for (const v of fixture.vlines) {
        const before = gaps
        const a = g.rows[v.from]!
        const b = g.rows[v.to]!
        const cx = a.left + (v.col + 0.5) * g.cw
        const midA = (a.top + a.bottom) / 2
        const midB = (b.top + b.bottom) / 2
        // The line's own column: across the cell, the one brightest on average from end to end (a single
        // row may be a horizontal rule, bright all across). Its ends are corners: from a pixel past each.
        const ys: number[] = []
        for (let y = midA + 1; y <= midB - 1; y += step) ys.push(y)
        const level = (x: number) => ys.reduce((sum, y) => sum + px(x, y).reduce((a, c) => a + c, 0), 0) / ys.length
        let best = cx
        let bright = -1
        for (let x = cx - g.cw / 2; x <= cx + g.cw / 2; x += step) {
          const l = level(x)
          if (l > bright) [bright, best] = [l, x]
        }
        const lit = Math.max(...ys.map((y) => px(best, y).reduce((a, c) => a + c, 0)))
        for (const y of ys) {
          const [r, gg, bb] = px(best, y)
          if (r! + gg! + bb! < lit - 240) gaps++
        }
        if (gaps > before) perLine.push(`col ${v.col} rows ${v.from}-${v.to}: ${gaps - before} at x ${best.toFixed(2)}`)
      }
      return { seams, gaps, perLine }
    },
    [png, { solids: fixture.solids, vlines: fixture.vlines }, g, dpr, TOLERANCE] as const,
  )
}

for (const fixture of FIXTURES)
  for (const cols of WIDTHS)
    for (const dpr of DPRS) {
      const name = `${fixture.name} ${cols} cols ${dpr}x`
      test(name, async ({ browser }) => {
        test.fail(KNOWN_RED.has(fixture.name), 'a known seam of today’s renderer')
        const context = await browser.newContext({ viewport: { width: cols > 60 ? 1280 : 412, height: 520 }, deviceScaleFactor: dpr })
        const page = await context.newPage()
        await page.goto(`/e2e/glyphs.html?fixture=${fixture.name}&cols=${cols}`)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(500) // measured scales applied, rows drawn
        const g = await geometry(page, fixture, cols)
        expect(g.rows.length).toBeGreaterThanOrEqual(fixture.lines(cols).length)
        const { seams, gaps, perLine } = await inspect(page, fixture, g, dpr)
        test.info().annotations.push({ type: 'result', description: `seams ${seams}, gaps ${gaps}, drift ${g.drift?.toFixed(2) ?? '-'}` })
        if (perLine.length) test.info().annotations.push({ type: 'gaps', description: perLine.join('; ') })
        expect.soft(seams, 'seam pixels between solid cells').toBe(0)
        expect.soft(gaps, 'gap pixels along vertical lines').toBe(0)
        if (g.drift !== undefined) expect.soft(g.drift, 'text against its cells at the row’s end (px)').toBeLessThanOrEqual(MAX_DRIFT)
        await context.close()
      })
    }
