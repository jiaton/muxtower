/** Clip 2, "Agents work across machines": a PM agent on the hub hands a task to a worker on the laptop,
 *  the worker checks its fix in a browser (staged), and reports back. */
import type { Page } from 'playwright'
import type { ClipScript } from '../record.ts'

const row = (page: Page, name: string) => page.getByRole('link').filter({ has: page.getByText(name, { exact: true }) })
const at = new Date().toISOString()
const item = (seq: number, kind: string, text: string, more: object = {}) => ({
  seq, kind, text, at, actions: [], images: [], tool_name: null, description: null, status: null, ask: null, ...more,
})
const PM = 'tidy-up'
const WORKER = 'laptop~migrations'

export const teamHandoff: ClipScript = {
  id: 'team-handoff',
  frame: 'desktop',
  viewport: { width: 1280, height: 800 },
  async setup(page) {
    await page.evaluate(
      ([PM, WORKER, pmItems]) => {
        const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
        const set = (id: string, session: object) => clip.play!(id, [{ after: 0, session }])
        // A calm list: nobody waiting on an approval or a question.
        set('shop-api', { state: 'busy', pending: null, summary: null, last_message: 'Adding retries to the payment client' })
        set('web-app', { state: 'busy', pending: null, summary: null, last_message: 'Building the usage chart' })
        set(PM, { name: 'shop-pm', team_role: 'pm', project: 'acme/shop-api', state: 'idle', unread: false, summary: null, last_message: 'Plan: retry a failed charge once.' })
        set(WORKER, { name: 'checkout', team_role: 'worker', project: 'acme/shop-api', state: 'idle', interrupted_at: null, summary: null, last_message: 'Ready for work.' })
        clip.setItems!(PM, pmItems)
        location.hash = `#/d/demo/s/${PM}`
      },
      [
        PM,
        WORKER,
        [
          item(1, 'prompt', 'Fix the checkout retry. Plan it, then give it to the worker on the laptop.'),
          item(2, 'reply', 'Plan: retry a failed charge once, with the same idempotency key, then check checkout in a browser.'),
        ],
      ] as const,
    )
    // Its conversation, not its terminal: that is where the task and the report show.
    await page.waitForTimeout(800)
    await page.locator('[aria-label="Conversation"]').filter({ visible: true }).first().click()
  },
  async run(r) {
    const { page } = r
    r.caption('A PM agent on the hub plans the work')
    await r.wait(1600)

    r.caption('It hands the task to the worker on the laptop')
    await r.play(PM, [
      {
        after: 0,
        items: [
          item(3, 'tool', 'to: "worker"', { tool_name: 'mcp__muxtower__send_task', description: 'Hand the checkout fix to the worker on the laptop', status: 'done' }),
          item(4, 'reply', 'Sent to checkout (worker, laptop). I will read its report when it is done.'),
        ],
      },
    ])
    await r.wait(300)
    await r.focus(page.getByText('Hand the checkout fix to the worker on the laptop'))
    await r.wait(1500)

    r.caption('The worker starts at once')
    await r.play(WORKER, [{ after: 0, session: { state: 'busy', last_message: 'Fixing the checkout retry' } }])
    await r.wait(300)
    await r.focus(row(page, 'checkout'))
    await r.wait(1400)

    r.caption('It checks the fix in a browser')
    await r.play(WORKER, [{ after: 0, session: { last_message: 'Checking checkout in the browser' } }])
    await r.focus(null)
    await r.browser({ x: 640, y: 60, width: 640, height: 660 }, 2700, 'checkout · laptop · driving the browser', 'localhost:5173/checkout')
    await r.wait(2900)

    r.caption('Then it reports back to the PM')
    await r.play(WORKER, [{ after: 0, session: { state: 'idle', unread: true, last_message: 'Done: the retry is fixed and checked in the browser.' } }])
    await r.play(PM, [
      {
        after: 0,
        items: [
          item(5, 'prompt', '[muxtower task from checkout (worker) · 9c41e2] Done: a failed charge retries once with the same key. Checkout went through in the browser.'),
          item(6, 'reply', 'The worker on the laptop fixed the retry, and checkout went through in the browser on the second try.'),
        ],
      },
    ])
    await r.wait(300)
    await r.focus(page.getByText('The worker on the laptop fixed the retry', { exact: false }))
    await r.wait(2200)
  },
}
