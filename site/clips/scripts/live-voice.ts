/** Clip 3, "Talk instead of type": Live mode on a phone. A sentence is said and lands in the message box,
 *  "send" sends it, "pause" stops the writing. The demo has no microphone or speech recognition: the
 *  recorder sets Live's state through the demo's clip hook, and the words said show as bubbles. */
import type { ClipScript } from '../record.ts'

const ID = 'shop-api'
const SAID = 'Run the migration on staging'
const at = new Date().toISOString()
const item = (seq: number, kind: string, text: string) => ({
  seq, kind, text, at, actions: [], images: [], tool_name: null, description: null, status: null, ask: null,
})

export const liveVoice: ClipScript = {
  id: 'live-voice',
  frame: 'phone',
  viewport: { width: 390, height: 844 },
  async setup(page) {
    await page.evaluate(
      ([ID, SAID, items, answer]) => {
        try {
          localStorage.setItem('muxtower.live.phone-note', '1') // the one-time phone note, already read
        } catch {}
        const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
        clip.play!(ID, [{ after: 0, session: { state: 'idle', pending: null, summary: null, unread: false, last_message: 'Run it on staging?' } }])
        clip.setItems!(ID, items)
        clip.setReply!(ID, answer)
        location.hash = `#/d/demo/s/${ID}`
      },
      [
        ID,
        SAID,
        [
          item(1, 'prompt', 'Write the migration for the retry columns.'),
          item(2, 'reply', 'Migration 0042 is written and passes on a copy of production. Run it on staging?'),
        ],
        [{ after: 0, session: { state: 'busy', last_message: 'Running the migration on staging' }, items: [item(3, 'prompt', SAID)] }],
      ] as const,
    )
    await page.waitForTimeout(900)
    const toggle = page.locator('[aria-label="Conversation"]').filter({ visible: true })
    if (await toggle.count()) await toggle.first().click()
    await page.evaluate(() => {
      const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => void> }).muxtowerClip
      clip.live!({ phase: 'listening', speaking: false, pending: 0, heard: null, error: null, commands: { state: 'ready' } })
    })
  },
  async run(r) {
    const { page } = r
    const footer = page.locator('footer').filter({ visible: true }).last()
    const live = (state: object) => r.hook('live', state)

    r.caption('Turn on Live and just talk')
    await r.focus(footer)
    await r.wait(1200)
    r.say(SAID, 2100)
    await live({ speaking: true })
    await r.wait(2000)
    await live({ speaking: false, pending: 1 })
    await r.wait(700)

    r.caption('Your words land in the box')
    await r.hook('land', ID, SAID)
    await live({ pending: 0 })
    await r.focus(footer) // taller now: the box holds the words
    await r.wait(1500)

    r.caption('Say “send” and it goes')
    await r.focus(null)
    r.say('send', 1000)
    await live({ speaking: true })
    await r.wait(800)
    await live({ speaking: false })
    await r.hook('heard', { kind: 'command', command: 'send', done: true, how: 'on device' })
    await r.hook('send', ID)
    await r.wait(2000)

    r.caption('Say “pause” to stop writing')
    r.say('pause', 1000)
    await live({ speaking: true })
    await r.wait(800)
    await live({ speaking: false, phase: 'paused' })
    await r.hook('heard', { kind: 'command', command: 'pause', done: true, how: 'on device' })
    await r.focus(footer)
    await r.wait(2100)
  },
}
