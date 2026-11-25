// The Inbox on the demo's made-up hub: add with Alt+N, set a due date, hand an item to a role, and put items
// in order (a mouse on the handle; a held finger on a phone).
import { expect, test, type Browser, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

test.setTimeout(150_000) // a cold dev server

async function start(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  const page = await context.newPage()
  await page.goto(`${DEMO}#/inbox`)
  await expect(page.getByText('Spacing tokens for the dense tables')).toBeVisible({ timeout: 60_000 })
  return page
}

const inbox = (page: Page) => page.getByRole('region', { name: 'Items' })
const rowOf = (page: Page, text: string) => page.locator('li[data-item]').filter({ hasText: text }).first()
/** The items in the list's order (not the copy a drop animates). */
const order = (page: Page) => inbox(page).locator('ul').first().locator(':scope > li[data-item] p').allInnerTexts()
const menuOf = async (page: Page, text: string) => {
  await rowOf(page, text).getByRole('button', { name: 'More for this item' }).click()
  return page.getByRole('menu')
}

test('desktop: Alt+N adds an item, its due date is set, it is handed to a role, and items are reordered', async ({ browser }) => {
  const page = await start(browser, 1440, 1000)
  await expect(page.getByRole('link', { name: /^Inbox/ })).toContainText('8')

  // Alt+N, from anywhere.
  await page.getByRole('searchbox', { name: 'Search sessions' }).click()
  await page.keyboard.press('Alt+KeyN')
  const add = page.getByRole('dialog', { name: 'Add to Inbox' })
  await add.getByRole('textbox', { name: 'What to add' }).fill('Write the onboarding email')
  await add.getByRole('combobox').selectOption('acme/web-app')
  await add.getByRole('textbox', { name: 'What to add' }).press('Enter')
  await expect(add).toBeHidden()
  await expect(rowOf(page, 'Write the onboarding email')).toContainText('acme/web-app')
  await expect(page.getByRole('link', { name: /^Inbox/ })).toContainText('9')

  // A due date: in a week, so it goes to Due soon.
  await (await menuOf(page, 'Write the onboarding email')).getByRole('menuitem', { name: 'Set due date' }).click()
  const due = page.getByRole('dialog', { name: 'Due date' })
  await due.getByRole('button', { name: 'In a week' }).click()
  await due.getByRole('button', { name: 'Save' }).click()
  const soon = page.getByRole('region', { name: 'Due soon' })
  await expect(soon.locator('li[data-item]').filter({ hasText: 'Write the onboarding email' })).toContainText('in 7 days')

  // Hand to a role: the project's default is picked; one click.
  await (await menuOf(page, 'Invoice PDFs should carry')).getByRole('menuitem', { name: 'Hand to…' }).click()
  const hand = page.getByRole('dialog', { name: 'Hand to…' })
  await expect(hand.getByText('Sends this as a task to tech lead in acme/shop-api')).toBeVisible()
  await hand.getByRole('button', { name: 'Hand to tech lead' }).click()
  await expect(hand).toBeHidden()
  await expect(rowOf(page, 'Invoice PDFs should carry')).toContainText('Handed to tech lead in acme/shop-api')

  // Reorder with the mouse on a row's handle.
  const before = await order(page)
  const first = rowOf(page, before[0]!)
  const third = rowOf(page, before[2]!)
  await first.hover()
  const handle = first.getByRole('button', { name: /^Move/ })
  const from = (await handle.boundingBox())!
  const to = (await third.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 4 })
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => order(page)).toEqual([before[1], before[2], before[0], ...before.slice(3)])
})

test('phone: the Inbox is a sheet, and a finger held on an item puts it elsewhere', async ({ browser }) => {
  const page = await start(browser, 390, 844, true)
  await expect(page.getByRole('dialog', { name: 'Inbox' })).toBeVisible()
  const before = await order(page)
  const row = (await rowOf(page, before[0]!).boundingBox())!
  const target = (await rowOf(page, before[2]!).boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const x = row.x + row.width / 2
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  // The row's middle is carried to the target's middle (rows wrap to different heights on a phone).
  const from = row.y + row.height / 2
  const end = target.y + target.height / 2 + 4
  await touch('touchStart', from)
  await page.waitForTimeout(500) // held still: picked up
  for (let y = from; y < end; y += 15) await touch('touchMove', y)
  await touch('touchMove', end)
  await touch('touchEnd', end)
  // Where a tall row lands depends on how the rows wrap: it went down, past the target, and stayed there.
  await expect.poll(async () => (await order(page)).indexOf(before[0]!)).toBeGreaterThanOrEqual(2)
  const after = await order(page)
  expect(after[0]).toBe(before[1])
  expect([...after].sort()).toEqual([...before].sort())
})
