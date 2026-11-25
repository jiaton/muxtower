// A sideways wheel over the session list (a mouse's thumb wheel, or Shift and the wheel) and [ ] switch the
// chip of the projects row, on the demo's made-up hub (chips Product, Ops, PMs). Real wheel events through
// the browser: only their deltas are read, so a sideways one need not scroll anything.
import { expect, test, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'
const IDLE = 400 // past the gesture's 300 ms rest

const chips = (page: Page) => page.getByRole('navigation', { name: 'Projects' })
const current = (page: Page) => chips(page).locator('a[data-current="true"]')
const list = (page: Page) => page.locator('section[aria-label="Sessions"]')

/** `n` wheel events of `dx` each over the list's first row, 16 ms apart, dispatched in the page. */
async function swipe(page: Page, n: number, dx: number) {
  await list(page)
    .locator('[data-row-link]')
    .first()
    .evaluate(
      async (row, [count, delta]) => {
        for (let i = 0; i < count; i++) {
          row.dispatchEvent(new WheelEvent('wheel', { deltaX: delta, deltaY: 0, bubbles: true, cancelable: true }))
          await new Promise((r) => setTimeout(r, 16))
        }
      },
      [n, dx] as const,
    )
}

/** The chip `name` chosen: clicked again only while it is not (the row draws again as its data comes, and a
 *  click on a link being replaced was lost on a loaded runner; a second click on a chosen chip lets it go). */
async function choose(page: Page, name: string) {
  const link = chips(page).getByRole('link', { name: new RegExp(`^${name}`) })
  await expect(async () => {
    if ((await link.getAttribute('data-current')) !== 'true') await link.click()
    await expect(link).toHaveAttribute('data-current', 'true', { timeout: 2000 })
  }).toPass({ timeout: 15_000 })
}

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
  // A trackpad's long swipe: a quick series, 16 ms apart as a trackpad sends them, one step only. Sent from in
  // the page: one page.mouse.wheel at a time waits for a round trip, which a loaded CI runner stretched past
  // the 300 ms rest (two gestures, rightly two steps).
  await swipe(page, 12, 30)
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

test('each chip opens the session last opened under it again', async ({ page }) => {
  await start(page, 1440, 900)
  const open = () => page.evaluate(() => decodeURIComponent(location.hash.split('?')[0]!))
  const rows = list(page).locator('[data-row-link]')
  const session = /^#\/d\/demo\/s\//
  await choose(page, 'Product')
  await expect.poll(open).toMatch(session) // nothing remembered yet: its first
  const first = await open()
  await rows.nth(1).click() // not its first, which a switch would open anyway
  await expect.poll(open).not.toBe(first)
  const product = await open()
  await choose(page, 'Ops')
  await expect.poll(open).not.toBe(product)
  const opsFirst = await open()
  await rows.last().click()
  await expect.poll(open).not.toBe(opsFirst)
  const ops = await open()
  await choose(page, 'Product')
  await expect.poll(open).toBe(product)
  // And by the wheel, back to Ops' session.
  await page.mouse.move(...(await center(rows.first())))
  await page.mouse.wheel(120, 0)
  await expect(current(page)).toHaveText(/^Ops/)
  await expect.poll(open).toBe(ops)
})

test('on a phone, ] switches the chip and stays on the list', async ({ page }) => {
  await start(page, 390, 844)
  await page.keyboard.press(']')
  await expect(current(page)).toHaveText(/^Product/)
  await page.waitForTimeout(IDLE)
  expect(await page.evaluate(() => location.hash)).toBe('#/?chip=product')
  await expect(list(page)).toBeVisible()
})

async function center(el: ReturnType<Page['locator']>): Promise<[number, number]> {
  const box = (await el.boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2]
}
