// The sidebar's drawer pushes the page aside (an inline transform). Gone while open (the sidebar docked
// again: focus mode left, "Keep the sidebar open", the window widened, as full screen does), it must put the
// page back: left pushed, the page kept a blank column, seen once a filter matched nothing.
import { expect, test, type Page } from '@playwright/test'

const DEMO = 'http://127.0.0.1:4418/'

async function openSidebar(page: Page) {
  let open = page.getByRole('button', { name: /^Open sidebar/ })
  if (!(await open.count())) {
    await page.getByRole('button', { name: 'Sessions' }).first().click() // focus mode: from the list's drawer
    open = page.getByRole('button', { name: /^Open sidebar/ })
  }
  await open.first().click()
  await expect(page.getByRole('link', { name: 'Daemons' }).last()).toBeInViewport() // the drawer is open
}

async function focus(page: Page) {
  // Alt+F is taken once the session's page is ready for it: pressed until focus mode shows.
  await expect(async () => {
    await page.keyboard.press('Alt+KeyF')
    await expect(page.getByRole('button', { name: 'Show the list and sidebar' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
}

const ways: Record<string, (page: Page) => Promise<void>> = {
  'focus mode left with the drawer open': async (page) => {
    await focus(page)
    await openSidebar(page)
    await page.keyboard.press('Alt+KeyF')
  },
  '"Keep the sidebar open" from focus mode': async (page) => {
    await focus(page)
    await openSidebar(page)
    await page.getByRole('button', { name: 'Keep the sidebar open' }).click()
    // The list, still hidden, back: focus mode on and off (Alt+F hides both, then shows both).
    await focus(page)
    await page.keyboard.press('Alt+KeyF')
    await expect(page.getByPlaceholder('Search sessions').first()).toBeVisible()
  },
  'the window widened (full screen) with the drawer open': async (page) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await openSidebar(page)
    await page.setViewportSize({ width: 1440, height: 900 })
  },
  'focus mode, the drawer opened and closed, focus mode left': async (page) => {
    await focus(page)
    await openSidebar(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Alt+KeyF')
  },
}

for (const [way, run] of Object.entries(ways)) {
  test(`no blank column after ${way}, then a filter that matches nothing`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    // A session open (focus mode applies only then), by its URL: a name like "web-app" matches a project too.
    await page.goto(`${DEMO}#/d/demo/s/web-app`)
    await expect(page.getByPlaceholder('Message the agent')).toBeVisible({ timeout: 20_000 }) // a cold dev server's first page
    await run(page)
    await page.keyboard.press('Escape')
    await page.getByPlaceholder('Search sessions').first().fill('zzqqxx-nothing')
    await expect(page.getByText(/No sessions match/)).toBeVisible()
    const nav = await page.getByRole('complementary', { name: 'Navigation' }).boundingBox()
    const content = page.locator('main').locator('..')
    await expect(content).toHaveAttribute('style', /^(?!.*translate)/)
    const box = (await content.boundingBox())!
    expect(Math.round(box.x)).toBe(Math.round(nav!.x + nav!.width)) // right beside the sidebar: no gap
    expect(Math.round(box.x + box.width)).toBe(1440) // and to the window's edge
  })
}

// A car's screen (between md and xl): the list in its drawer (focus mode) fills the drawer, no empty strip.
test('the Sessions drawer is filled by its list at a car-like width', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 650 }, hasTouch: true })).newPage()
  await page.goto(`${DEMO}#/d/demo/s/web-app`)
  await expect(page.getByPlaceholder('Message the agent')).toBeVisible({ timeout: 20_000 })
  await focus(page)
  await page.getByRole('button', { name: 'Sessions' }).first().click()
  const list = page.getByRole('region', { name: 'Sessions' }).or(page.locator('section[aria-label="Sessions"]')).first()
  await expect(list).toBeInViewport()
  const widths = await list.evaluate((el) => ({
    list: el.getBoundingClientRect().width,
    drawer: el.parentElement!.getBoundingClientRect().width,
  }))
  expect(Math.round(widths.list)).toBe(Math.round(widths.drawer))
})
