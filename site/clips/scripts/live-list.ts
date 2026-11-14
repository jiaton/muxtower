/** Clip 1, "Every agent, live, anywhere": an agent in tmux on one machine, the same session in a desktop
 *  browser and on a phone. A message sent from the phone shows in all three at once; then sessions on two
 *  machines change state everywhere; then the phone's rows: a swipe for quick actions (Pin), a long press
 *  for the full menu (notifications). Each screen is its own page of the demo, kept in step by the script;
 *  the terminal is drawn. */
import type { Page } from 'playwright'
import type { ClipScript, Recorder } from '../record.ts'

const ID = 'shop-api'
const SENT = 'Add retries with backoff to the payment client'
const ASK = { kind: 'question', tool_name: null, detail: 'Which chart library should I use for the usage page?' }
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
const ITEMS = [
  item(1, 'prompt', 'Why did two payment webhooks fail last night?'),
  item(2, 'reply', 'The provider timed out on both. Nothing was charged twice. The client has no retry yet.'),
]
const row = (page: Page, name: string) =>
  page
    .getByRole('link')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ visible: true })
    .first()

/** The same scene on every screen: everyone at work, nothing waiting, this session open. */
async function scene(page: Page) {
  await page.evaluate(
    ([ID, items, sent]) => {
      const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
      clip.hold!() // the demo's own story stops: only the script moves things
      const set = (id: string, session: object) => clip.play!(id, [{ after: 0, session }])
      // Sent a message, the session gets to work (not the demo's stock answer).
      clip.setReply!(ID, [{ after: 0, session: { state: 'busy', last_message: 'Reading the payment client' }, items: [sent] }])
      set(ID, { state: 'idle', pending: null, summary: null, unread: false, last_message: 'The client has no retry yet.' })
      set('web-app', { state: 'busy', pending: null, summary: null, last_message: 'Building the usage chart' })
      set('docs', { state: 'busy', summary: null, last_message: 'Writing the payments guide' })
      set('laptop~infra', { state: 'busy', unread: false, summary: null, last_message: 'Running terraform plan' })
      set('laptop~migrations', { state: 'idle', interrupted_at: null })
      clip.setItems!(ID, items)
      location.hash = `#/d/demo/s/${ID}`
    },
    [ID, ITEMS, item(3, 'prompt', SENT)] as const,
  )
  await page.waitForTimeout(900)
  const toggle = page.locator('[aria-label="Conversation"]').filter({ visible: true })
  if (await toggle.count()) await toggle.first().click()
}

export const liveList: ClipScript = {
  id: 'live-list',
  // The terminal behind, the browser before it, the phone at the side.
  layers: [
    { terminal: 'tmux · claude · ~/code/shop-api', x: 40, y: 170, width: 900, height: 560 },
    { view: 'desktop', x: 380, y: 400, height: 650, url: 'app.muxtower.dev' },
    { view: 'phone', x: 1430, y: 170, height: 880 },
  ],
  views: [
    { name: 'phone', kind: 'phone', viewport: { width: 390, height: 844 }, setup: scene },
    { name: 'desktop', kind: 'desktop', viewport: { width: 1000, height: 600 }, setup: scene },
  ],
  run,
}

async function run(r: Recorder) {
  const phone = r.on('phone')
  const desktop = r.on('desktop')
  const { page } = phone
  r.term('Why did two payment webhooks fail last night?', 'prompt')
  r.term('⏺ Both timed out at the provider. The client has no retry.', 'out')

  r.caption('Send from your phone, it lands everywhere')
  const box = page
    .getByRole('textbox', { name: /message/i })
    .filter({ visible: true })
    .first()
  await phone.focus(page.locator('footer').filter({ visible: true }).last())
  await phone.type(box, SENT, 1000)
  await phone.click(page.getByRole('button', { name: 'Send', exact: true }).filter({ visible: true }).first(), 0)
  // What the daemon does with it, on every screen at once, and in the terminal.
  r.term(SENT, 'prompt')
  // The phone's own send has its session at work; the desktop hears of it from the daemon.
  await desktop.play(ID, [
    { after: 0, session: { state: 'busy', last_message: 'Reading the payment client' }, items: [item(3, 'prompt', SENT)] },
  ])
  await desktop.focus(desktop.page.getByText(SENT).filter({ visible: true }).last())
  await r.wait(500)
  r.term('✻ Working… (esc to interrupt)', 'work')
  await r.wait(500)
  r.term('⏺ Read src/payments/client.ts', 'dim')
  await r.wait(1200)

  r.caption('Every agent, every machine, live')
  await desktop.focus(null)
  await phone.focus(null)
  await page.evaluate(() => history.back())
  await r.wait(500)
  await r.everywhere('play', 'web-app', [{ after: 0, session: { state: 'needs_answer', pending: ASK, last_message: ASK.detail } }])
  await phone.focus(row(page, 'web-app'))
  await r.wait(1000)
  await r.everywhere('play', 'laptop~infra', [
    { after: 0, session: { state: 'idle', unread: true, last_message: 'Plan is clean: 3 to add, 0 to change, 0 to destroy.' } },
  ])
  await phone.focus(row(page, 'infra'))
  await r.wait(1000)

  r.caption('Swipe a row for quick actions')
  await phone.focus(null)
  await phone.swipe(row(page, 'docs'), -230, 380)
  await r.wait(100)
  await phone.click(page.getByRole('button', { name: 'Pin', exact: true }).filter({ visible: true }).first(), 300)
  await phone.focus(row(page, 'docs'))
  await r.wait(900)

  r.caption('Hold it for everything else')
  await phone.focus(null)
  // Down the list to the release notes and their forks, the tree in view.
  await row(page, 'Release notes for 2.4').evaluate((el) => {
    let list = el.parentElement
    while (list && !(list.scrollHeight > list.clientHeight && getComputedStyle(list).overflowY !== 'visible'))
      list = list.parentElement
    if (!list) return
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top
    list.scrollBy({ top: top - 160, behavior: 'smooth' })
  })
  await r.wait(700)
  await phone.press(row(page, 'Release notes for 2.4'), 600)
  await r.wait(500)
  await phone.click(page.getByRole('menuitemradio', { name: /Only when it needs me/ }).first(), 1000)
}
