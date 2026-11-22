// Keyboard shortcuts on the demo's made-up hub: Ctrl+U and its undo in the message box (the browser's own
// delete, so its own undo), ↑ recalling the message sent last, Alt+V switching the view, "?" opening the
// cheat sheet. MUXTOWER_SHOTS=<dir> also saves the sheet (light and dark, 2x) and a shortcut tooltip.
import { expect, test, type Browser } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'
const SHOTS = process.env.MUXTOWER_SHOTS

async function start(browser: Browser, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme })
  const page = await context.newPage()
  await page.goto(`${DEMO}#/d/demo/s/web-app`)
  await expect(page.getByPlaceholder('Message the agent')).toBeVisible({ timeout: 20_000 }) // a cold dev server's first page
  return page
}

test('Ctrl+U and undo, ↑ recall, Alt+V, "?"', async ({ browser }) => {
  const page = await start(browser)
  const box = page.getByRole('textbox', { name: 'Message the agent' })

  // Ctrl+U clears; Ctrl+Z (this is not a Mac) brings it back, by the browser's own undo.
  await box.fill('Draft the release notes')
  await page.keyboard.press('Control+KeyU')
  await expect(box).toHaveValue('')
  await page.keyboard.press('Control+KeyZ')
  await expect(box).toHaveValue('Draft the release notes')

  // Sent, then ↑ in the empty box: back, the caret at its end; ↓ empties it again.
  await box.fill('Run the checks')
  await page.keyboard.press('Enter')
  await expect(box).toHaveValue('')
  await page.keyboard.press('ArrowUp')
  await expect(box).toHaveValue('Run the checks')
  expect(await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe('Run the checks'.length)
  await page.keyboard.press('ArrowDown')
  await expect(box).toHaveValue('')

  // Alt+V: the other view, even while typing; the switch's tooltips say it.
  const terminal = page.getByRole('radio', { name: 'Terminal', exact: true })
  const conversation = page.getByRole('radio', { name: 'Conversation', exact: true })
  await expect(terminal).toHaveAttribute('title', 'Terminal (Alt+V)')
  const before = await terminal.getAttribute('aria-checked')
  await page.keyboard.press('Alt+KeyV')
  await expect(terminal).not.toHaveAttribute('aria-checked', before!)
  await page.keyboard.press('Alt+KeyV')
  await expect(terminal).toHaveAttribute('aria-checked', before!)
  await expect(conversation).toHaveAttribute('title', 'Conversation (Alt+V)')

  // "?" outside the box: the cheat sheet.
  await box.blur()
  await page.keyboard.press('Shift+Slash')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Interrupt the agent, while it works')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cheat-sheet-light.png` })
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  if (SHOTS) {
    // The session menu: Mark as unread's tooltip names Alt+R (a native tooltip: drawn by the system, so
    // shown here as the item's title next to it).
    await page.getByRole('button', { name: 'More actions' }).click()
    const item = page.getByRole('menuitem', { name: /Mark as (un)?read/ })
    await item.hover()
    const title = await item.getAttribute('title')
    expect(title).toMatch(/\(Alt\+R\)$/)
    await page.screenshot({ path: `${SHOTS}/menu-shortcut.png` })
    await page.keyboard.press('Escape')
    // ⌘K's commands with their keys, from the same registry.
    await page.keyboard.press('Control+KeyK')
    await page.getByRole('combobox').fill('keyboard')
    await expect(page.getByRole('option', { name: /^Keyboard shortcuts/ })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/palette-keys.png` })
  }
})

test('the cheat sheet in the dark', async ({ browser }) => {
  test.skip(!SHOTS, 'screenshots only')
  const page = await start(browser, 'dark')
  await page.keyboard.press('Shift+Slash')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/cheat-sheet-dark.png` })
})
