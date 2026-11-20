// A sideways wheel over the session list (a mouse's thumb wheel, or Shift and the wheel) and [ ] switch the
// chip of the projects row, on the demo's made-up hub (chips Product, Ops, PMs). Real wheel events through
// the browser: only their deltas are read, so a sideways one need not scroll anything.
import { expect, test, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'
const IDLE = 400 // past the gesture's 300 ms rest

const chips = (page: Page) => page.getByRole('navigation', { name: 'Projects' })
const current = (page: Page) => chips(page).locator('a[data-current="true"]')
const list = (page: Page) => page.locator('section[aria-label="Sessions"]')

async function start(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto(`${DEMO}#/`)
  await expect(chips(page).getByRole('link', { name: /^Product/ })).toBeVisible({ timeout: 20_000 })
  await expect(current(page)).toHaveCount(0) // no chip: "All"
  const row = list(page).locator('[data-row-link]').first()
  const box = (await row.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2) // over the list's first row
}

test('a sideways wheel over the list steps through the chips, once per gesture, never wrapping', async ({ page }) => {
  await start(page, 1440, 900)
  await page.mouse.wheel(120, 0)
  await expect(current(page)).toHaveText(/^Product/)
  await page.waitForTimeout(IDLE)
  // A trackpad's long swipe: a quick series, one step only.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(30, 0)
  await expect(current(page)).toHaveText(/^Ops/)
  await page.waitForTimeout(IDLE)
  await expect(current(page)).toHaveText(/^Ops/)
  // Shift and the vertical wheel.
  await page.keyboard.down('Shift')
  await page.mouse.wheel(0, 120)
  await page.keyboard.up('Shift')
  await expect(current(page)).toHaveText(/^PMs/)
  await page.waitForTimeout(IDLE)
  await page.mouse.wheel(120, 0) // past the end: nothing
  await page.waitForTimeout(IDLE)
  await expect(current(page)).toHaveText(/^PMs/)
  // Back, to no chip, and no further.
  for (const name of [/^Ops/, /^Product/]) {
    await page.mouse.wheel(-120, 0)
    await expect(current(page)).toHaveText(name)
    await page.waitForTimeout(IDLE)
  }
  await page.mouse.wheel(-120, 0)
  await expect(current(page)).toHaveCount(0)
  await page.waitForTimeout(IDLE)
  await page.mouse.wheel(-120, 0)
  await page.waitForTimeout(IDLE)
  await expect(current(page)).toHaveCount(0)
})

test('a vertical wheel still scrolls the list and switches nothing', async ({ page }) => {
  await start(page, 1440, 420)
  const scroller = list(page).locator('[data-row-link]').first()
  const top = () =>
    scroller.evaluate((el) => {
      let box: HTMLElement | null = el
      while (box && getComputedStyle(box).overflowY !== 'auto') box = box.parentElement
      return box!.scrollTop
    })
  expect(await top()).toBe(0)
  await page.mouse.wheel(0, 300)
  await expect.poll(top).toBeGreaterThan(0)
  await page.waitForTimeout(IDLE)
  await expect(current(page)).toHaveCount(0)
})

test('[ and ] switch the chip outside a text field', async ({ page }) => {
  await start(page, 1440, 900)
  await page.keyboard.press(']')
  await expect(current(page)).toHaveText(/^Product/)
  await page.keyboard.press(']')
  await expect(current(page)).toHaveText(/^Ops/)
  await page.keyboard.press('[')
  await expect(current(page)).toHaveText(/^Product/)
  await page.getByPlaceholder('Search sessions').first().focus()
  await page.keyboard.press(']')
  await expect(page.getByPlaceholder('Search sessions').first()).toHaveValue(']')
  await expect(current(page)).toHaveText(/^Product/)
})
