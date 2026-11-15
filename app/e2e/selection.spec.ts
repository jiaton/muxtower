// Over the painted layer (app/AGENTS.md › Terminal glyphs): a selection still shows, on painted backgrounds
// as anywhere, and copying gives the characters themselves (a frame's ┌──┐, a block's █), not nothing.
import { expect, test } from '@playwright/test'

for (const [device, width, dpr] of [
  ['phone', 412, 2.6],
  ['desktop', 1280, 1],
] as const) {
  test(`${device}: a selection shows over painted backgrounds, and copies the real characters`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 600 }, deviceScaleFactor: dpr })
    const page = await context.newPage()
    for (const name of ['backgrounds', 'frames', 'blocks']) {
      await page.goto(`/e2e/glyphs.html?fixture=${name}&cols=46`)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      // A cell of row 1, a blank row on its painted background: its colour before and after selecting all.
      const at = await page.evaluate(() => {
        const row = document.querySelectorAll<HTMLElement>('[role=log] > div:last-child > div')[1]!.getBoundingClientRect()
        return { x: row.left + 20, y: (row.top + row.bottom) / 2 }
      })
      const colour = async () => {
        const shot = await page.screenshot({ clip: { x: at.x, y: at.y, width: 1, height: 1 }, scale: 'css' })
        return page.evaluate(async (png) => {
          const img = new Image()
          await new Promise((r) => {
            img.onload = r
            img.src = `data:image/png;base64,${png}`
          })
          const ctx = new OffscreenCanvas(1, 1).getContext('2d')!
          ctx.drawImage(img, 0, 0)
          return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
        }, shot.toString('base64'))
      }
      const before = await colour()
      const copied = await page.evaluate(() => {
        const log = document.querySelector('[role=log] > div:last-child')!
        const range = document.createRange()
        range.selectNodeContents(log)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(range)
        return getSelection()!.toString()
      })
      const after = await colour()
      if (name === 'backgrounds') {
        const change = Math.max(...before.map((v, i) => Math.abs(v - after[i]!)))
        test.info().annotations.push({ type: 'result', description: `${name}: ${before} → ${after} selected (Δ ${change})` })
        expect(change, 'the selection shows over a painted background').toBeGreaterThan(40)
      }
      if (name === 'frames') expect(copied).toContain('┌──────┐ ┏━━━━━━┓ ╔══════╗ ╭──────╮')
      if (name === 'blocks') expect(copied).toContain('██████')
    }
    await context.close()
  })
}
