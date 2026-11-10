/** Clip 3, "Talk instead of type": Live mode, and what sets it apart. What is said lands in the
 *  message box and "send" sends it; it follows to the next session without being turned on again; while
 *  nothing is said nothing goes anywhere; "pause" and "resume" are commands, heard on the phone, and never
 *  written. The demo has no microphone or speech recognition: the recorder sets Live's state through the
 *  demo's clip hook, and the words said show as bubbles. */
import type { Page } from 'playwright'
import type { ClipScript, Recorder } from '../record.ts'

const A = 'shop-api'
const B = 'web-app'
const SAID_A = 'Retry the failed webhooks'
const SAID_B = 'Use the chart library we already have'
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
const idle = (last: string) => [{ after: 0, session: { state: 'idle', pending: null, summary: null, unread: false, last_message: last } }]
const busy = (last: string, said: string) => [
  { after: 0, session: { state: 'busy', last_message: last }, items: [item(5, 'prompt', said)] },
]

const SCENES = {
  [A]: {
    idle: idle('Two webhooks failed overnight.'),
    items: [
      item(1, 'prompt', 'Check last night’s payment webhooks.'),
      item(2, 'reply', '214 webhooks came in overnight; 212 went through.'),
      item(3, 'prompt', 'Why did the other two fail?'),
      item(4, 'reply', 'The provider timed out on both, at 03:12 and 03:14. Nothing was charged twice. Retry them?'),
    ],
    reply: busy('Retrying the 2 failed webhooks', SAID_A),
  },
  [B]: {
    idle: idle('Which chart library should I use?'),
    items: [
      item(1, 'prompt', 'Add a usage chart to the billing page.'),
      item(2, 'reply', 'The billing page has room for it under the plan card. I would show the last 30 days, by day.'),
      item(3, 'prompt', 'Good, 30 days.'),
      item(4, 'reply', 'Which chart library should I use?'),
    ],
    reply: busy('Building the usage chart', SAID_B),
  },
}

type Hook = { muxtowerClip: Record<string, (...a: unknown[]) => void> }

export const liveVoice: ClipScript = {
  id: 'live-voice',
  layers: [{ view: 'desktop', x: 257, y: 160, height: 890, url: 'app.muxtower.dev' }],
  views: [{ name: 'desktop', kind: 'desktop', viewport: { width: 1000, height: 600 }, setup }],
  run,
}

async function setup(page: Page) {
  await page.evaluate(
    ([A, scenes]) => {
      const clip = (window as never as Hook).muxtowerClip
      for (const [id, s] of Object.entries(scenes)) {
        clip.play!(id, s.idle)
        clip.setItems!(id, s.items)
        clip.setReply!(id, s.reply)
      }
      location.hash = `#/d/demo/s/${A}`
    },
    [A, SCENES] as const,
  )
  await page.waitForTimeout(900)
  const toggle = page.locator('[aria-label="Conversation"]').filter({ visible: true })
  if (await toggle.count()) await toggle.first().click()
  await page.evaluate(() =>
    (window as never as Hook).muxtowerClip.live!({
      phase: 'listening',
      speaking: false,
      pending: 0,
      heard: null,
      error: null,
      commands: { state: 'ready' },
    }),
  )
}

async function run(r: Recorder) {
  const { page } = r
  const footer = page.locator('footer').filter({ visible: true }).last()
  const live = (state: object) => r.hook('live', state)
  /** Words dictated: said, written down, landed in the box. */
  const dictate = async (id: string, text: string, ms: number) => {
    r.say(text, ms)
    await live({ speaking: true })
    await r.wait(ms - 300)
    await live({ speaking: false, pending: 1 })
    await r.wait(600)
    await r.hook('land', id, text)
    await live({ pending: 0 })
  }
  /** A command: heard on the device, done, never written. */
  const command = async (word: string, then: object = {}) => {
    r.say(word, 900)
    await live({ speaking: true })
    await r.wait(600)
    await live({ speaking: false, ...then })
    await r.hook('heard', { kind: 'command', command: word, done: true, how: 'on device' })
  }

  r.caption('Turn on Live and just talk')
  await r.focus(footer)
  await r.wait(600)
  await dictate(A, SAID_A, 1500)
  await r.wait(300)
  r.caption('Say “send” to send')
  await command('send')
  await r.hook('send', A)
  await r.wait(900)

  r.caption('Open another session: Live is still on')
  await r.focus(null)
  await r.click(
    page
      .getByRole('link')
      .filter({ has: page.getByText(B, { exact: true }) })
      .filter({ visible: true })
      .first(),
    500,
  )
  await r.focus(footer)
  await r.wait(500)
  await dictate(B, SAID_B, 1700)
  await r.wait(300)
  await command('send')
  await r.hook('send', B)
  await r.wait(700)

  r.caption('Silent? Nothing is uploaded')
  await r.wait(1700)

  r.caption('Commands are heard on the device, never typed')
  await command('pause', { phase: 'paused' })
  await r.wait(1200)
  await command('resume', { phase: 'listening' })
  await r.wait(1400)
}
