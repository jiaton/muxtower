/** Clip 1, "See every agent, live": the list on a phone, sessions on two machines changing state as it
 *  is watched, then one group of projects. */
import type { Page } from 'playwright'
import type { ClipScript } from '../record.ts'

const row = (page: Page, name: string) => page.getByRole('link').filter({ has: page.getByText(name, { exact: true }) })

const ASK = { kind: 'question', tool_name: null, detail: 'Which chart library should I use for the usage page?' }

export const liveList: ClipScript = {
  id: 'live-list',
  frame: 'phone',
  viewport: { width: 390, height: 844 },
  // Everyone at work, nothing waiting: the state the clip starts from.
  async setup(page) {
    await page.evaluate(() => {
      const clip = (window as never as { muxtowerClip: { play(id: string, steps: unknown[]): void } }).muxtowerClip
      const at = (id: string, session: object) => clip.play(id, [{ after: 0, session }])
      at('shop-api', { state: 'busy', pending: null, summary: null, last_message: 'Adding retries to the payment client' })
      at('web-app', { state: 'busy', pending: null, summary: null, last_message: 'Building the usage chart' })
      at('docs', { state: 'busy', summary: null, last_message: 'Writing the payments guide' })
      at('laptop~infra', { state: 'busy', unread: false, summary: null, last_message: 'Running terraform plan' })
      at('laptop~migrations', { state: 'idle', interrupted_at: null })
    })
  },
  async run(r) {
    const { page } = r
    r.caption('Every agent, every machine, one list')
    await r.wait(2600)

    r.caption('One stops to ask you something')
    await r.play('web-app', [{ after: 0, session: { state: 'needs_answer', pending: ASK, last_message: ASK.detail } }])
    await r.wait(300)
    await r.focus(row(page, 'web-app'))
    await r.wait(2200)

    r.caption('Another finishes, on the laptop')
    await r.play('laptop~infra', [
      { after: 0, session: { state: 'idle', unread: true, last_message: 'Plan is clean: 3 to add, 0 to change, 0 to destroy.' } },
    ])
    await r.wait(300)
    await r.focus(row(page, 'infra'))
    await r.wait(2200)

    r.caption('Tap a group to see just its projects')
    await r.focus(null)
    await r.click(page.getByRole('navigation', { name: 'Projects' }).getByText('Product', { exact: true }), 2200)
  },
}
