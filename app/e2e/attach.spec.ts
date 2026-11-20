// Attaching a file to a message, on the demo (its made-up hub answers the upload as a daemon does, its bytes
// sent at a made-up speed): the chip uploads, becomes ready, goes with the message, and the box clears.
import { expect, test } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'

test('a file added uploads at once, its chip becomes ready, and sending clears it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${DEMO}#/d/demo/s/web-app`)
  const box = page.getByPlaceholder('Message the agent')
  await expect(box).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Add pictures or files' })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add pictures or files' }).click()
  await (await chooser).setFiles({ name: 'release-checklist.md', mimeType: 'text/markdown', buffer: Buffer.alloc(600_000, 'x') })
  const files = page.getByRole('list', { name: 'Files' })
  await expect(files.getByRole('group', { name: /release-checklist\.md, uploading/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Uploading…' })).toBeVisible()
  await expect(files.getByRole('group', { name: 'release-checklist.md, 600 KB' })).toBeVisible()
  await box.fill('Check this list before the release')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(files).toHaveCount(0)
  await expect(box).toHaveValue('')
})
