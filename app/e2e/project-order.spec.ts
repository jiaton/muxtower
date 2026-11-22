// The list grouped by project, on the demo's made-up hub: projects in the owner's order (the demo's is not by
// name), put in order by dragging a header's ⋮⋮ handle (a mouse), the keyboard or a held finger; and nothing
// of that gets in the way of scrolling: a wheel over a header, sideways deltas as a trackpad sends them, a
// finger that scrolls from a header, a swipe on a row.
import { expect, test, type Browser, type CDPSession, type Locator, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

test.setTimeout(150_000) // several pages at once on a cold dev server

async function start(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  const page = await context.newPage()
  await page.goto(`${DEMO}#/?group=project`)
  await expect(projectHeader(page, 'acme/web-app')).toBeVisible({ timeout: 60_000 }) // a cold dev server's first page
  return page
}

const list = (page: Page) =>
  page.getByRole('region', { name: 'Sessions', exact: true }).filter({ has: page.getByRole('searchbox', { name: 'Search sessions' }) })
const projectHeader = (page: Page, name: string) => list(page).getByRole('region', { name, exact: true }).getByRole('heading', { level: 3 })
/** A header's own button, which folds its group. */
const foldOf = (page: Page, name: string) => projectHeader(page, name).getByRole('button', { name: new RegExp(`^${name}`) })
/** The groups in the list's order, by their sections' names (a lifted header's copy has none). */
const order = (page: Page) =>
  list(page).evaluate((el) =>
    [...el.querySelectorAll('section[aria-label]')].filter((s) => s.querySelector(':scope > h3')).map((s) => s.getAttribute('aria-label')!),
  )
/** The three projects these tests move (the demo has more, which come after them, by name). */
const MOVED = ['acme/web-app', 'acme/shop-api', 'acme/infra']
const projects = async (page: Page) => (await order(page)).filter((t) => MOVED.includes(t))

/** The list's scroller: the nearest ancestor of its headers that scrolls. */
/** The sidebar's PROJECTS section, top to bottom. */
const sidebarProjects = async (page: Page) =>
  (
    await page
      .getByRole('navigation', { name: 'Sessions' })
      .locator('xpath=.//div[./div/span[normalize-space()="Projects"]]') // the section, not the device tree below
      .getByRole('link')
      .allInnerTexts()
  )
    .map((t) => t.split('\n')[0]!.trim())
    .filter((t) => MOVED.includes(t))

/** The chip `name` chosen: clicked again only while it is not (the row draws again as its data comes, and a
 *  click on a link being replaced was lost on a loaded runner; a second click on a chosen chip lets it go). */
async function pickChip(page: Page, name: string) {
  const link = list(page).getByRole('link', { name: new RegExp(`^${name}`) })
  await expect(async () => {
    if ((await link.getAttribute('data-current')) !== 'true') await link.click()
    await expect(link).toHaveAttribute('data-current', 'true', { timeout: 2000 })
  }).toPass({ timeout: 15_000 })
}

async function scroller(page: Page): Promise<Locator> {
  const header = list(page).getByRole('heading', { level: 3 }).first()
  await header.evaluate((h) => {
    let el: HTMLElement | null = h.parentElement
    while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    el?.setAttribute('data-test-scroller', '')
  })
  return page.locator('[data-test-scroller]')
}
const scrollTop = (box: Locator) => box.evaluate((el) => el.scrollTop)
const said = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent).join(' '))
const lifted = (page: Page) => page.evaluate(() => /Picked up/.test(document.body.textContent ?? ''))

test('the demo’s projects in the owner’s order, not by name; a PM and a lead first in theirs', async ({ browser }) => {
  const page = await start(browser, 1440, 900)
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra'])
  expect(await sidebarProjects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra']) // the one order
  const rows = list(page).getByRole('region', { name: 'acme/shop-api', exact: true }).locator('[data-row]')
  await expect(rows.first()).toHaveAttribute('data-row', /\/pm$/)
  await expect(rows.nth(1)).toHaveAttribute('data-row', /\/lead$/)
})

test('desktop: a header’s handle shows on hover; dragged with the mouse, the project lands where let go', async ({ browser }) => {
  const page = await start(browser, 1440, 1600) // every project on screen
  const handle = list(page).getByRole('button', { name: 'Move acme/infra' })
  await expect(handle).toHaveCSS('opacity', '0')
  await projectHeader(page, 'acme/infra').hover()
  await expect(handle).toHaveCSS('opacity', '1')
  const from = (await handle.boundingBox())!
  const to = (await projectHeader(page, 'acme/web-app').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 4 })
  await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => projects(page)).toEqual(['acme/infra', 'acme/web-app', 'acme/shop-api'])
  await expect.poll(() => sidebarProjects(page)).toEqual(['acme/infra', 'acme/web-app', 'acme/shop-api']) // follows
  await expect(foldOf(page, 'acme/infra')).toHaveAttribute('aria-expanded', 'true') // the drop folded nothing
})

test('keyboard: Space, the arrows, Space put a project in its place', async ({ browser }) => {
  const page = await start(browser, 1440, 900)
  await list(page).getByRole('button', { name: 'Move acme/web-app' }).focus()
  await page.keyboard.press('Space')
  await expect.poll(() => lifted(page)).toBe(true)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => said(page)).toMatch(/moved to place 2 of 8/) // the demo has 8 projects
  await page.keyboard.press('Space')
  await expect.poll(() => projects(page)).toEqual(['acme/shop-api', 'acme/web-app', 'acme/infra'])
})

test('the header menu moves a project up and down', async ({ browser }) => {
  const page = await start(browser, 1440, 900)
  await list(page).getByRole('button', { name: 'More for acme/shop-api' }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await expect.poll(() => projects(page)).toEqual(['acme/shop-api', 'acme/web-app', 'acme/infra'])
  await list(page).getByRole('button', { name: 'More for acme/shop-api' }).click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra'])
})

test('a mouse wheel over a header scrolls the list; trackpad deltas sideways lift nothing', async ({ browser }) => {
  const page = await start(browser, 1440, 520)
  const box = await scroller(page)
  // Every wheel event the page sees, and whether anything took it from the browser.
  await page.evaluate(() => {
    const seen: boolean[] = ((window as unknown as { wheels: boolean[] }).wheels = [])
    window.addEventListener('wheel', (e) => void setTimeout(() => seen.push(e.defaultPrevented)), { capture: true, passive: true })
  })
  const header = projectHeader(page, 'acme/web-app')
  const at = (await header.boundingBox())!
  await page.mouse.move(at.x + 40, at.y + at.height / 2)
  await page.mouse.wheel(0, 240)
  await expect.poll(() => scrollTop(box)).toBeGreaterThan(100)
  const down = await scrollTop(box)
  // A trackpad over the sticky header of the group at the top: a sideways swipe, then a swipe up that drifts sideways.
  const top = (await box.boundingBox())!
  await page.mouse.move(top.x + 60, top.y + 12)
  expect(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('h3')), [top.x + 60, top.y + 12])).toBe(true)
  await page.mouse.wheel(180, 0)
  await page.mouse.wheel(4, -120)
  // (Chromium as Playwright drives it scrolls a wheel with any sideways part not at all, in every grouping: the
  // page only has to take none of them.) Then up again, as a wheel or a trackpad going straight.
  await page.mouse.wheel(0, -120)
  await expect.poll(() => scrollTop(box)).toBeLessThan(down)
  expect(await box.evaluate((el) => el.scrollLeft)).toBe(0)
  await expect.poll(() => page.evaluate(() => (window as unknown as { wheels: boolean[] }).wheels)).toEqual([false, false, false, false]) // none taken
  expect(await lifted(page)).toBe(false)
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra']) // as the list settles
})

/** A finger: down at (x, y), moved to (x2, y2) in steps, held `holdMs` first, then let go (CDP touch events). */
async function finger(cdp: CDPSession, x: number, y: number, x2: number, y2: number, holdMs = 0, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  if (holdMs) await new Promise((r) => setTimeout(r, holdMs))
  for (let i = 1; i <= steps; i++) {
    const p = { x: x + ((x2 - x) * i) / steps, y: y + ((y2 - y) * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
    await new Promise((r) => setTimeout(r, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('phone: a finger that scrolls from a header scrolls the list and lifts nothing', async ({ browser }) => {
  const page = await start(browser, 390, 700, true)
  const box = await scroller(page)
  const at = (await projectHeader(page, 'acme/shop-api').boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await finger(cdp, at.x + 150, at.y + at.height / 2, at.x + 150, at.y + at.height / 2 - 300, 0, 12)
  await expect.poll(() => scrollTop(box)).toBeGreaterThan(100)
  expect(await lifted(page)).toBe(false)
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra'])
})

test('phone: a finger held on a header picks the project up and puts it where it is let go', async ({ browser }) => {
  const page = await start(browser, 390, 900, true)
  await foldOf(page, 'acme/shop-api').tap() // a tap still folds
  await expect(foldOf(page, 'acme/shop-api')).toHaveAttribute('aria-expanded', 'false')
  await expect(projectHeader(page, 'acme/infra')).toBeInViewport()
  // Where the fold put it: the headers below slide up as shop-api folds, and a finger aimed mid-slide (a slow
  // CI runner) held nothing.
  const top = async () => (await projectHeader(page, 'acme/infra').boundingBox())?.y
  await expect(async () => {
    const was = await top()
    await page.waitForTimeout(150)
    expect(await top()).toBe(was)
  }).toPass({ timeout: 10_000 })
  const from = (await projectHeader(page, 'acme/infra').boundingBox())!
  const to = (await projectHeader(page, 'acme/web-app').boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  // Held still until the page has picked it up (a fixed wait was too short on a slow CI runner: the first step
  // then cancelled the hold), then moved and let go.
  const [x, y] = [from.x + 120, from.y + from.height / 2]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await expect.poll(() => lifted(page), { timeout: 5000 }).toBe(true)
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + ((to.y + 4 - y) * i) / 16 }] })
    await new Promise((r) => setTimeout(r, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => projects(page)).toEqual(['acme/infra', 'acme/web-app', 'acme/shop-api'])
  await expect(foldOf(page, 'acme/infra')).toHaveAttribute('aria-expanded', 'true') // the drop folded nothing
})

test('phone: a swipe on a row still opens its actions', async ({ browser }) => {
  const page = await start(browser, 390, 900, true)
  const row = list(page).locator('[data-swipe-row]').first()
  const at = (await row.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await finger(cdp, at.x + at.width - 40, at.y + at.height / 2, at.x + 60, at.y + at.height / 2)
  await expect(list(page).locator('[data-swipe-open]')).toHaveCount(1)
  expect(await lifted(page)).toBe(false)
})

test('in a chip (a narrowed view) projects move too: the dragged one alone, the hidden ones kept in place', async ({ browser }) => {
  // The demo's order: web-app, shop-api, infra. The Product chip shows web-app and shop-api; infra is hidden.
  const page = await start(browser, 1440, 1600)
  await pickChip(page, 'Product')
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api'])
  const handle = list(page).getByRole('button', { name: 'Move acme/shop-api' })
  await projectHeader(page, 'acme/shop-api').hover()
  await expect(handle).toHaveCSS('opacity', '1')
  const from = (await handle.boundingBox())!
  const to = (await projectHeader(page, 'acme/web-app').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 4 })
  await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => projects(page)).toEqual(['acme/shop-api', 'acme/web-app'])
  // The whole list (the chip let go, no reload): infra still last.
  const all = () => page.evaluate(() => void (location.hash = '#/?group=project'))
  const chip = () => pickChip(page, 'Product')
  await all()
  await expect.poll(() => projects(page)).toEqual(['acme/shop-api', 'acme/web-app', 'acme/infra'])
  // The menu's Move down in the chip: past the next project shown.
  await chip()
  await expect.poll(() => projects(page)).toEqual(['acme/shop-api', 'acme/web-app'])
  await list(page).getByRole('button', { name: 'More for acme/shop-api' }).click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api'])
  await all()
  await expect.poll(() => projects(page)).toEqual(['acme/web-app', 'acme/shop-api', 'acme/infra'])
})

test('a view with one project shows its handle disabled, saying why, never silently missing', async ({ browser }) => {
  const page = await start(browser, 1440, 1200)
  await pickChip(page, 'Ops') // infra and Other: one project
  await expect.poll(() => projects(page)).toEqual(['acme/infra'])
  const handle = list(page).getByRole('button', { name: 'Move acme/infra' })
  await projectHeader(page, 'acme/infra').hover()
  await expect(handle).toHaveCSS('opacity', '1')
  await expect(handle).toHaveAttribute('aria-disabled', 'true')
  await expect(handle).toHaveAttribute('title', /only project shown here/)
})
