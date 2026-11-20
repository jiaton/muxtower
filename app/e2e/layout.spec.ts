// The layout (sidebar, list and session · list and session · session only), its switch always at the top-left
// of the leftmost pane showing (the sidebar's, the list's or the session's header), the panel-left that opens the one drawer, Alt+F, on the demo's made-up hub.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

async function start(browser: Browser, width: number, height: number, touch = false) {
  const page = await (await browser.newContext({ viewport: { width, height }, hasTouch: touch })).newPage()
  // A session open (the list leaves only beside one), by its URL: a name like "web-app" matches a project too.
  await page.goto(`${DEMO}#/d/demo/s/web-app`)
  await expect(page.getByPlaceholder('Message the agent')).toBeVisible({ timeout: 20_000 }) // a cold dev server's first page
  return page
}

const switchOf = (page: Page) => page.getByRole('radiogroup', { name: 'Layout' })
const segment = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })
const panelLeft = (page: Page, name: 'Show the sidebar' | 'Show sessions') => page.getByRole('button', { name: new RegExp(`^${name}`) })
const drawer = (page: Page) => page.getByRole('dialog', { name: /^(Sessions|Navigation)$/ }).and(page.locator('[aria-modal="true"]'))

/** A layout picked in the switch (docked, or in the drawer, which then closes). */
async function pick(page: Page, layout: string) {
  await segment(page, layout).click()
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
}

/** Alt+F until `shown` is: pressed again only while the layout has not changed. Alt+F toggles, so a press
 *  that landed but showed late must not be repeated (that flipped it back, on and on, on a loaded machine). */
async function altF(page: Page, shown: Locator) {
  await expect(async () => {
    if (!(await shown.isVisible())) await page.keyboard.press('Alt+KeyF')
    await expect(shown).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 15_000 })
}

/** The page beside the docked sidebar: no blank column left by a drawer that pushed it aside. */
async function noBlankColumn(page: Page, width: number) {
  await page.getByPlaceholder('Search sessions').first().fill('zzqqxx-nothing')
  await expect(page.getByText(/No sessions match/)).toBeVisible()
  const nav = await page.getByRole('complementary', { name: 'Navigation' }).boundingBox()
  const content = page.locator('main').locator('..')
  await expect(content).toHaveAttribute('style', /^(?!.*translate)/)
  const box = (await content.boundingBox())!
  expect(Math.round(box.x)).toBe(Math.round(nav!.x + nav!.width)) // right beside the sidebar: no gap
  expect(Math.round(box.x + box.width)).toBe(width) // and to the window's edge
}

// The sidebar's drawer pushes the page aside (an inline transform). Gone while open (the sidebar docked
// again: a wider layout picked, Alt+F, the window widened), it must put the page back.
const ways: Record<string, (page: Page) => Promise<void>> = {
  'the full layout picked in the drawer': async (page) => {
    await pick(page, 'List and session')
    await panelLeft(page, 'Show the sidebar').click()
    await expect(drawer(page)).toBeInViewport()
    await pick(page, 'Sidebar, list and session')
  },
  'Alt+F there and back with the drawer open': async (page) => {
    await pick(page, 'List and session')
    await panelLeft(page, 'Show the sidebar').click()
    await altF(page, panelLeft(page, 'Show sessions'))
    await altF(page, panelLeft(page, 'Show the sidebar'))
    await panelLeft(page, 'Show the sidebar').click()
    await pick(page, 'Sidebar, list and session')
  },
  'the window widened (full screen) with the drawer open': async (page) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await panelLeft(page, 'Show the sidebar').click()
    await expect(drawer(page)).toBeInViewport()
    await page.setViewportSize({ width: 1440, height: 900 })
  },
}

for (const [way, run] of Object.entries(ways)) {
  test(`no blank column after ${way}, then a filter that matches nothing`, async ({ browser }) => {
    const page = await start(browser, 1440, 900)
    await run(page)
    await page.keyboard.press('Escape')
    await noBlankColumn(page, 1440)
  })
}

test('desktop 1440: three layouts, panel-left with the needs-you count, one drawer, Alt+F', async ({ browser }) => {
  test.setTimeout(60_000) // a long walk through every layout: near 30 s on a busy machine
  const page = await start(browser, 1440, 900)
  // Sidebar, list and session: the switch, three segments, no panel-left, nothing to hide a pane with.
  await expect(switchOf(page).getByRole('radio')).toHaveCount(3)
  await expect(segment(page, 'Sidebar, list and session')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: /^Show (the sidebar|sessions)/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(Hide the|Focus|Sessions$|Open sidebar)/ })).toHaveCount(0)
  const needs = Number(
    await page
      .getByRole('link', { name: /^Needs you/ })
      .innerText()
      .then((t) => /\d+/.exec(t)?.[0] ?? 0),
  )

  // List and session: the compact switch and panel-left at the list's top-left, "Show the sidebar", with the count.
  await pick(page, 'List and session')
  const showSidebar = panelLeft(page, 'Show the sidebar')
  await expect(showSidebar).toHaveAccessibleName(needs ? new RegExp(`\\(${needs} needs? you\\)`) : 'Show the sidebar')
  if (needs) await expect(showSidebar).toHaveText(String(needs))
  const list = page.getByRole('region', { name: 'Sessions' }).or(page.locator('section[aria-label="Sessions"]')).first()
  const [at, button, pane] = [await switchOf(page).boundingBox(), await showSidebar.boundingBox(), await list.boundingBox()]
  expect(at!.x - pane!.x).toBeLessThan(24) // the switch at the leftmost pane's top-left
  expect(button!.x - (at!.x + at!.width)).toBeLessThan(12) // and the panel-left right beside it
  await showSidebar.click()
  await expect(drawer(page)).toBeInViewport()
  await expect(drawer(page).getByRole('radiogroup', { name: 'Layout' })).toBeVisible() // the switch, at its top-left
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toHaveCount(0)

  // Session only (picked in the drawer's switch): panel-left in the session's header, "Show sessions"; the
  // sidebar and list side by side.
  await showSidebar.click()
  await pick(page, 'Session only')
  await expect(page.getByRole('complementary', { name: 'Navigation' })).toHaveCount(0)
  const showSessions = panelLeft(page, 'Show sessions')
  await expect(showSessions).toBeVisible()
  await showSessions.click()
  const open = page.getByRole('dialog', { name: 'Sessions' })
  await expect(open).toBeInViewport()
  const nav = open.getByRole('navigation', { name: 'Sessions' })
  const inner = open.locator('section[aria-label="Sessions"]')
  const [navBox, listBox] = [await nav.boundingBox(), await inner.boundingBox()]
  expect(navBox!.x).toBeLessThan(listBox!.x) // side by side, as they dock
  expect(Math.abs(navBox!.y - listBox!.y)).toBeLessThan(80)
  await expect(open.getByRole('radio', { name: 'Session only', exact: true })).toHaveAttribute('aria-checked', 'true')

  // Closes on a tap outside, Esc, and a session picked (staying in Session only).
  await page.mouse.click(1400, 450)
  await expect(page.getByRole('dialog', { name: 'Sessions' }).and(page.locator('[aria-modal="true"]'))).toHaveCount(0)
  await showSessions.click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
  await showSessions.click()
  // Settled before a row is picked (it slides in): a CI runner under load once saw the row move for 30 s.
  await expect(open).toHaveCSS('translate', 'none')
  const row = open.locator('a[data-row-link]:not([aria-current])').first()
  await row.click()
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
  await expect(page).not.toHaveURL(/s\/web-app$/)
  await expect(panelLeft(page, 'Show sessions')).toBeVisible()

  // New session, in Session only: in the drawer's list header.
  await showSessions.click()
  await open.getByRole('button', { name: 'New session' }).click()
  await expect(page.getByRole('dialog', { name: /New session/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Alt+F: back to the layout before Session only, and to it again.
  await page.keyboard.press('Escape')
  await altF(page, panelLeft(page, 'Show the sidebar')) // list and session
  await altF(page, panelLeft(page, 'Show sessions'))
})

test('Fold 900: two segments, the saved layout kept for when it unfolds', async ({ browser }) => {
  const page = await start(browser, 900, 800)
  // Saved: the full layout. Shown: the widest this screen can, list and session.
  await expect(page.getByRole('complementary', { name: 'Navigation' })).toHaveCount(0)
  await panelLeft(page, 'Show the sidebar').click()
  await expect(switchOf(page).getByRole('radio')).toHaveCount(2)
  await expect(segment(page, 'List and session')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  // Unfolded: the saved layout is back, never overwritten by the narrow screen.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('complementary', { name: 'Navigation' })).toBeVisible()
  await expect(segment(page, 'Sidebar, list and session')).toHaveAttribute('aria-checked', 'true')
  await page.setViewportSize({ width: 900, height: 800 })

  // Session only on the Fold: one drawer, the sidebar and the list side by side, 576 px of 900.
  await altF(page, panelLeft(page, 'Show sessions'))
  await panelLeft(page, 'Show sessions').click()
  const open = page.getByRole('dialog', { name: 'Sessions' })
  await expect(open).toBeInViewport()
  expect(Math.round((await open.boundingBox())!.width)).toBe(576)
  await expect(open.getByRole('navigation', { name: 'Sessions' })).toBeInViewport()
})

// A car's screen (between lg and xl, touch): in Session only, the list fills the drawer beside the sidebar.
test('car 1100: the list fills its drawer beside the sidebar', async ({ browser }) => {
  const page = await start(browser, 1100, 650, true)
  await altF(page, panelLeft(page, 'Show sessions'))
  await panelLeft(page, 'Show sessions').click()
  const open = page.getByRole('dialog', { name: 'Sessions' })
  const list = open.locator('section[aria-label="Sessions"]')
  await expect(list).toBeInViewport()
  const widths = await list.evaluate((el) => ({
    list: el.getBoundingClientRect().width,
    side: el.previousElementSibling!.getBoundingClientRect().width,
    drawer: el.parentElement!.getBoundingClientRect().width,
  }))
  expect(Math.round(widths.list + widths.side)).toBe(Math.round(widths.drawer))
})

test('phone 390: one pane at a time, panel-left one level up, no switch', async ({ browser }) => {
  const page = await start(browser, 390, 800, true)
  await expect(switchOf(page)).toHaveCount(0)
  await panelLeft(page, 'Show sessions').click()
  const open = page.getByRole('dialog', { name: 'Sessions' })
  await expect(open).toBeInViewport()
  await expect(open.getByRole('navigation', { name: 'Sessions' })).toHaveCount(0) // the list alone
  await expect(open.getByRole('button', { name: /^Show the sidebar/ })).toHaveCount(0) // no drawer in a drawer
  await page.goto(`${DEMO}#/`)
  await panelLeft(page, 'Show the sidebar').click()
  await expect(page.getByRole('link', { name: 'Daemons' })).toBeInViewport()
  await expect(switchOf(page)).toHaveCount(0)
})

// The switch is never out of reach: in every layout, at the top-left of the leftmost pane showing, the shown one
// filled, every segment working from where it sits; the header keeps its controls (the title gives way).
const LEFTMOST: Record<string, string> = {
  'Sidebar, list and session': 'aside[aria-label="Navigation"]',
  'List and session': 'section[aria-label="Sessions"]',
  'Session only': 'section:has([placeholder="Message the agent"])',
}
for (const [width, height, layouts] of [
  [1440, 900, ['Sidebar, list and session', 'List and session', 'Session only']],
  [1100, 650, ['Sidebar, list and session', 'List and session', 'Session only']],
  [900, 800, ['List and session', 'Session only']],
] as const) {
  test(`${width}: the switch at the leftmost pane's top-left in every layout, each segment working there`, async ({ browser }) => {
    test.setTimeout(90_000) // every pair of layouts, each a re-layout of the whole app
    const page = await start(browser, width, height)
    for (const from of layouts) {
      for (const to of layouts) {
        if (to === from) continue
        if (!(await segment(page, from).getAttribute('aria-checked'))?.includes('true')) await pick(page, from)
        await expect(switchOf(page)).toHaveCount(1)
        await expect(switchOf(page)).toBeInViewport()
        await expect(switchOf(page).getByRole('radio')).toHaveCount(layouts.length)
        await expect(segment(page, from)).toHaveAttribute('aria-checked', 'true')
        await expect(segment(page, from)).toHaveAttribute('title', from)
        const pane = (await page.locator(LEFTMOST[from]).first().boundingBox())!
        const at = (await switchOf(page).boundingBox())!
        expect(at.x - pane.x).toBeLessThan(24) // the top-left of the leftmost pane
        expect(at.y - pane.y).toBeLessThan(32)
        if (from !== 'Sidebar, list and session') {
          // Beside the panel-left, and the header's controls still all there: the title truncates first.
          const header = page.locator(LEFTMOST[from]).first().locator('header').first()
          await expect(header.getByRole('button', { name: /^Show (the sidebar|sessions)/ })).toBeInViewport()
          const actions = header.getByRole('button', { name: from === 'Session only' ? 'More actions' : 'New session' }).first()
          await expect(actions).toBeInViewport()
          expect((await actions.boundingBox())!.x + 32).toBeLessThanOrEqual(pane.x + pane.width + 1)
        }
        await pick(page, to)
        await expect(segment(page, to)).toHaveAttribute('aria-checked', 'true')
        await expect(page.getByRole('complementary', { name: 'Navigation' })).toHaveCount(to === 'Sidebar, list and session' ? 1 : 0)
      }
    }
  })
}
