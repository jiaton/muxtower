/** Clip 4, "Keyboard flow": reply to one part of what an agent wrote without leaving the keyboard. A
 *  passage is selected and quoted (Reply); focus goes to that quote's own reply, Enter goes on to the
 *  message box, and Enter sends both. Each key shows as a key cap. */
import type { Page } from 'playwright'
import type { ClipScript, Recorder } from '../record.ts'

const ID = 'shop-api'
const PASSAGE = 'retry a failed charge once, with the same idempotency key'
const at = new Date().toISOString()
const item = (seq: number, kind: string, text: string) => ({
  seq,
  kind,
  text,
  at,
  actions: [],
  images: [],
  tool_name: null,
  description: null,
  status: null,
  ask: null,
})

export const keyboardFlow: ClipScript = {
  id: 'keyboard-flow',
  layers: [{ view: 'desktop', x: 257, y: 160, height: 890, url: 'app.muxtower.dev' }],
  views: [{ name: 'desktop', kind: 'desktop', viewport: { width: 1000, height: 600 }, setup }],
  run,
}

async function setup(page: Page) {
  await page.evaluate(
    ([ID, items, reply]) => {
      const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
      clip.play!(ID, [
        { after: 0, session: { state: 'idle', pending: null, summary: null, unread: false, last_message: 'Two ways to fix it.' } },
      ])
      clip.setItems!(ID, items)
      clip.setReply!(ID, reply)
      location.hash = `#/d/demo/s/${ID}`
    },
    [
      ID,
      [
        item(1, 'prompt', 'Checkout fails when the card network times out. How should we fix it?'),
        item(
          2,
          'reply',
          `Two ways. We could ${PASSAGE}, which is safe because the provider drops a duplicate. Or we could queue the charge and finish it in the background, which takes a new worker.`,
        ),
      ],
      [{ after: 0, session: { state: 'busy', last_message: 'Adding the retry' } }],
    ] as const,
  )
  await page.waitForTimeout(900)
  const toggle = page.locator('[aria-label="Conversation"]').filter({ visible: true })
  if (await toggle.count()) await toggle.first().click()
}

async function run(r: Recorder) {
  const { page } = r
  const said = page.getByText(PASSAGE, { exact: false }).last()
  r.caption('Select a part, Reply')
  await r.focus(said)
  await r.select(said, PASSAGE, 600)
  await r.wait(100)
  await r.click(page.getByRole('button', { name: 'Reply', exact: true }).filter({ visible: true }).first(), 400)

  r.caption('Answer that part, then the rest')
  await r.focus(page.locator('footer').filter({ visible: true }).last())
  await r.typeKeys('Yes, and log each retry', 800)
  await r.wait(150)
  await r.key('Enter', '⏎ Enter')
  await r.wait(250)
  await r.typeKeys('Add a test for it too', 750)
  await r.wait(150)
  await r.key('Enter', '⏎ Enter')
  await r.wait(400)

  r.caption('Sent, without the mouse')
  await r.focus(null)
  await r.wait(1400)
}
