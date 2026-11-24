// The Team dialog on the demo's made-up hub (acme/billing: five sessions, six tasks today): opened from a
// session's ⋯ menu, the role saved as it is left ("Saved"), another project picked from the floating list.
import { expect, test } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

test.setTimeout(120_000) // a cold dev server

test('the role saves on leave, and a project picked from the list moves the session', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${DEMO}#/d/demo/s/bill-lead`)
  await expect(page.locator('h1', { hasText: 'billing lead' }).first()).toBeVisible({ timeout: 60_000 }) // a cold dev server
  await page.locator('header').getByRole('button', { name: 'More actions' }).first().click()
  await page.getByRole('menuitem', { name: 'Team' }).click()

  const dialog = page.getByRole('dialog', { name: 'Team · acme/billing' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('list', { name: 'Members' }).getByRole('button')).toHaveCount(5)
  await expect(dialog.getByRole('region', { name: 'Recent tasks' }).getByRole('listitem')).toHaveCount(6)

  const role = dialog.getByRole('combobox', { name: 'Role' })
  await role.fill('lead for billing')
  await dialog.getByRole('textbox', { name: 'Note' }).click() // leaves the role
  await expect(dialog.getByRole('region', { name: 'This session' }).getByText('Saved')).toBeVisible()
  await expect(page.locator('header').getByText('lead for billing').first()).toBeVisible() // the header says it too

  const project = page.getByRole('dialog').getByRole('combobox', { name: 'Project' })
  await project.click()
  await page
    .getByRole('listbox')
    .getByRole('option', { name: /acme\/infra/ })
    .click()
  const moved = page.getByRole('dialog', { name: 'Team · acme/infra' })
  await expect(moved).toBeVisible() // retitled: the session is in acme/infra's team now
  await expect(moved.getByRole('list', { name: 'Members' }).getByText('this session')).toBeVisible()
  await expect(project).toHaveValue('acme/infra')
  await project.blur()
  await expect(project).toHaveValue('acme/infra') // kept: it was picked
})
