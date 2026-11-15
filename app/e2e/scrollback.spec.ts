// The painted layer's cost (app/AGENTS.md › Terminal glyphs): a 2,000-line scrollback whose rows are mostly
// painted (frames, blocks, backgrounds), then output streaming in a line a frame, each update within the
// app's own render budget (lib/diagnostics `renderMs`, as the view measures it: parse, diff and draw).
import { expect, test } from '@playwright/test'

const BUDGET_MS = 50 // lib/diagnostics WEB_LIMITS.renderMs

for (const [cols, width] of [
  [46, 412],
  [96, 1280],
] as const) {
  test(`2,000 painted lines at ${cols} cols: streaming stays within the render budget`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(`/e2e/glyphs.html?perf=2000&cols=${cols}`)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const painted = await page.evaluate(() => document.querySelectorAll('.term-paint').length)
    await page.evaluate(() => (window as unknown as { stream: (n: number) => Promise<void> }).stream(60))
    const ms = await page.evaluate(() => (window as unknown as { renderMs: () => { avg: number; max: number } }).renderMs())
    test.info().annotations.push({ type: 'result', description: `painted rows ${painted}, render avg ${ms.avg} ms, max ${ms.max} ms` })
    expect(painted).toBeGreaterThan(1000) // most rows painted
    expect(ms.avg).toBeLessThanOrEqual(BUDGET_MS)
    await context.close()
  })
}
