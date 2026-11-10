/** Clip 4, "Keyboard flow", on the live terminal: the session's own screen (Claude Code as it is in tmux,
 *  forwarded), not the conversation read from its history. A passage of what the agent wrote on screen
 *  is selected and quoted (Reply); focus goes to that quote's own reply, Enter goes on to the message
 *  box, and Enter sends both, typed into the pane. Each key shows as a key cap. */
import type { Page } from 'playwright'
import type { ClipScript, Recorder } from '../record.ts'

const ID = 'shop-api'
/** Part of the agent's answer on screen (the demo's shop-api story ends with it). */
const PASSAGE = 'retries up to 3 times with backoff'
const QUOTE_REPLY = 'Make it 2 retries'
const MAIN = 'Then open a PR'
const gray = (s: string) => `\x1b[90m${s}\x1b[0m`

export const keyboardFlow: ClipScript = {
  id: 'keyboard-flow',
  layers: [{ view: 'desktop', x: 257, y: 160, height: 890, url: 'app.muxtower.dev' }],
  views: [{ name: 'desktop', kind: 'desktop', viewport: { width: 1000, height: 600 }, setup }],
  run,
}

async function setup(page: Page) {
  // The story as the demo tells it: the agent asked to run the tests, is let, and answers on its screen.
  await page.evaluate(async (id) => {
    await fetch(`https://daemon.demo.invalid/v1/sessions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    location.hash = `#/d/demo/s/${id}`
  }, ID)
  await page.waitForTimeout(4200)
  // What it does with the message: muxtower types it into the pane, and the agent gets to work.
  await page.evaluate(
    ([id, lines]) => {
      const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
      clip.hold!()
      clip.setReply!(id, [{ after: 0, session: { state: 'busy', last_message: 'Changing the retries' }, add: lines }])
    },
    // As Claude Code shows a prompt: the quote first (Markdown), its reply, then the message.
    [ID, ['', `${gray('>')} > ${PASSAGE}`, `  ${QUOTE_REPLY}`, '', `  ${MAIN}`, '', '✻ Working… (esc to interrupt)']] as const,
  )
  const terminal = page.locator('[aria-label="Terminal"]').filter({ visible: true })
  if (await terminal.count()) await terminal.first().click()
  await page.waitForTimeout(600)
}

async function run(r: Recorder) {
  const { page } = r
  // On the session's screen, not the list (whose row shows the same last words).
  const screen = (text: string) => page.getByRole('log', { name: 'Session output' }).getByText(text, { exact: false }).last()
  r.caption('Works on the live terminal too')
  await r.focus(screen(PASSAGE))
  await r.wait(1100)

  r.caption('Select a part, Reply')
  await r.select(screen(PASSAGE), PASSAGE, 600)
  await r.wait(100)
  await r.click(page.getByRole('button', { name: 'Reply', exact: true }).filter({ visible: true }).first(), 400)

  r.caption('Answer that part, then the rest')
  await r.focus(page.locator('footer').filter({ visible: true }).last())
  await r.typeKeys(QUOTE_REPLY, 700)
  await r.wait(150)
  await r.key('Enter', '⏎ Enter')
  await r.wait(250)
  await r.typeKeys(MAIN, 600)
  await r.wait(150)
  await r.key('Enter', '⏎ Enter')
  await r.wait(400)

  r.caption('Sent, without the mouse')
  await r.focus(null)
  await r.wait(1600)
}
