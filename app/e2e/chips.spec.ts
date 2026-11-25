// The project chip row under the search, with a mouse (the demo's made-up hub, at a width where it overflows):
// its wheel, its fades and its ‹ ›. A real browser's wheel: dispatched through the compositor, so the scroll
// chain (which a box that only clips, under the pointer, once ended) is the browser's own.
import { expect, test, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

async function start(page: Page) {
  await page.setViewportSize({ width: 900, height: 800 })
  await page.goto(`${DEMO}#/d/demo/s/web-app`)
  await expect(page.getByPlaceholder('Message the agent')).toBeVisible({ timeout: 20_000 })
  const row = page.getByRole('navigation', { name: 'Projects' }).locator('[data-scroll-row]')
  const max = await row.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(max).toBeGreaterThan(4) // it overflows here; if the demo's chips change, pick another width
  // Whether anything took the wheel from the page: read after every listener ran.
  await page.evaluate(() => {
    const w = window as unknown as { taken: boolean[] }
    w.taken = []
    window.addEventListener('wheel', (e) => w.taken.push(e.defaultPrevented), { passive: true })
  })
  const label = row.getByRole('link').first().locator('span').first()
  const box = (await label.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2) // over a chip's truncated label
  return { row, max, left: () => row.evaluate((el) => Math.round(el.scrollLeft)) }
}

const taken = (page: Page) => page.evaluate(() => (window as unknown as { taken: boolean[] }).taken.at(-1))

test('a vertical wheel over the row scrolls it sideways, and at its end goes on to the page', async ({ page }) => {
  const { max, left } = await start(page)
  await page.mouse.wheel(0, 100)
  await expect.poll(left).toBe(max)
  expect(await taken(page)).toBe(true)
  await page.mouse.wheel(0, 100) // at the end: not taken
  await expect.poll(() => taken(page)).toBe(false)
  await page.mouse.wheel(0, -100)
  await expect.poll(left).toBe(0)
})

test('a mouse’s notch over the row scrolls it at once, not eased', async ({ page }) => {
  const { row, max } = await start(page)
  // Read in the same task as the wheel: an eased scroll would not have moved yet.
  const moved = await row.evaluate((el) => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }))
    return Math.round(el.scrollLeft)
  })
  expect(moved).toBe(Math.min(40, max))
})

test('a sideways wheel (a trackpad) over a chip’s label scrolls the row, one to one', async ({ page }) => {
  const { max, left } = await start(page)
  await page.mouse.wheel(Math.min(4, max), 0)
  await expect.poll(left).toBe(Math.min(4, max))
  expect(await taken(page)).toBe(false) // the browser's own scroll
  await page.mouse.wheel(-40, 0)
  await expect.poll(left).toBe(0)
})

test('faded where there is more, and › on hover scrolls there', async ({ page }) => {
  const { row, max, left } = await start(page)
  await expect(row).toHaveAttribute('data-more-end', '')
  await expect(row).not.toHaveAttribute('data-more-start', '')
  const next = page.getByRole('button', { name: 'Scroll right' })
  await expect(next).toBeVisible() // the mouse is over the row
  await next.click()
  await expect.poll(left).toBe(max)
  await expect(row).toHaveAttribute('data-more-start', '')
  await expect(row).not.toHaveAttribute('data-more-end', '')
  await expect(page.getByRole('button', { name: 'Scroll left' })).toBeVisible()
  await page.mouse.move(5, 790) // away: no ‹ ›
  await expect(page.getByRole('button', { name: 'Scroll left' })).toBeHidden()
})
