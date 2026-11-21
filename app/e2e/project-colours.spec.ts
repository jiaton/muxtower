// Each project's colour, on the demo's made-up hub (8 projects with stored hues): a dot on the list's project
// group headers and the sidebar's Projects, a tinted tag in the session header and ⌘K; changed from a group
// header's ⋯ menu (Colour), and shown in all four places at once. On a phone the picker is in the menu's sheet.
import { expect, test, type Browser, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

test.setTimeout(120_000) // a cold dev server

async function start(browser: Browser, width: number, height: number, phone = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone })
  const page = await context.newPage()
  await page.goto(`${DEMO}#/d/demo/s/web-app?group=project`)
  await expect(page.locator('h1', { hasText: 'web-app' }).first()).toBeVisible({ timeout: 60_000 }) // a cold dev server
  return page
}

const list = (page: Page) =>
  page.getByRole('region', { name: 'Sessions', exact: true }).filter({ has: page.getByRole('searchbox', { name: 'Search sessions' }) })
const groupHeader = (page: Page, name: string) => list(page).getByRole('region', { name, exact: true }).getByRole('heading', { level: 3 })
const sidebarItem = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Sessions' }).getByRole('link', { name: new RegExp(`^${name}`) })
const headerTag = (page: Page) => page.locator('header [data-tag="project"]').first()

/** The hue each place shows for a project (null: neutral). */
async function shown(page: Page, project: string) {
  const dot = async (where: ReturnType<typeof groupHeader>) =>
    (await where.locator('[data-hue]').count()) ? await where.locator('[data-hue]').first().getAttribute('data-hue') : null
  return { group: await dot(groupHeader(page, project)), sidebar: await dot(sidebarItem(page, project)), tag: await headerTag(page).getAttribute('data-hue') }
}

async function paletteTag(page: Page, session: string) {
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Go to a session or a command' }).fill(session)
  const tag = page.getByRole('listbox').getByRole('option').filter({ hasText: session }).first().locator('[data-tag="project"]')
  const hue = await tag.getAttribute('data-hue')
  const ground = await tag.evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.keyboard.press('Escape')
  return { hue, ground }
}

test('the stored colours show in the list, the sidebar, the header and ⌘K; a pick in the ⋯ menu changes all four', async ({ browser }) => {
  const page = await start(browser, 1440, 900)
  await expect.poll(() => shown(page, 'acme/web-app')).toEqual({ group: '1', sidebar: '1', tag: '1' })
  await expect.poll(() => shown(page, 'labs/ml-pipeline').then((s) => [s.group, s.sidebar])).toEqual(['6', '6'])
  const before = await paletteTag(page, 'web-app')
  expect(before.hue).toBe('1')
  expect(before.ground).not.toBe('rgba(0, 0, 0, 0)') // the token is there: a tinted ground

  await groupHeader(page, 'acme/web-app').getByRole('button', { name: 'More for acme/web-app' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitemradio', { name: 'Rose' })).toHaveAttribute('aria-checked', 'true')
  await menu.getByRole('menuitemradio', { name: 'Moss' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(() => shown(page, 'acme/web-app')).toEqual({ group: '5', sidebar: '5', tag: '5' })
  const after = await paletteTag(page, 'web-app')
  expect(after.hue).toBe('5')
  expect(after.ground).not.toBe(before.ground)
})

test('the picker is keyboard reachable: arrows along the swatches, Enter picks', async ({ browser }) => {
  const page = await start(browser, 1440, 900)
  const more = groupHeader(page, 'acme/infra').getByRole('button', { name: 'More for acme/infra' })
  await more.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitemradio', { name: 'Ochre' }).focus() // acme/infra's own (3)
  await page.keyboard.press('ArrowRight')
  await expect(menu.getByRole('menuitemradio', { name: 'Mauve' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => shown(page, 'acme/infra').then((s) => [s.group, s.sidebar])).toEqual(['4', '4'])
})

test('phone: the ⋯ menu is a sheet with the colour picker in it', async ({ browser }) => {
  const page = await start(browser, 390, 844, true)
  await page.goto(`${DEMO}#/?group=project`)
  const header = groupHeader(page, 'acme/shop-api')
  await expect(header).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => header.locator('[data-hue]').first().getAttribute('data-hue')).toBe('2')
  await header.getByRole('button', { name: 'More for acme/shop-api' }).tap()
  const sheet = page.locator('[role="menu"][data-sheet]')
  await expect(sheet.getByRole('group', { name: 'Colour' })).toBeVisible()
  await sheet.getByRole('menuitemradio', { name: 'Clay' }).tap()
  await expect(sheet).toBeHidden()
  await expect.poll(() => header.locator('[data-hue]').first().getAttribute('data-hue')).toBe('6')
})
