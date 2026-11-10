/** Records one clip: the demo app (built with the clip hook, `?clip`) in Playwright, its screen captured as
 *  it is drawn (Chrome's screencast), resampled to a steady frame rate, and a log of what the script did.
 *  Fake data only: everything comes from the demo's own simulated daemon. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium, type Locator, type Page } from 'playwright'
import type { ClipEvent, ClipMeta, Rect } from './clip.ts'

export interface Recorder {
  page: Page
  /** Seconds since the recording began. */
  now(): number
  caption(text: string): void
  focus(target: Locator | Rect | null): Promise<void>
  /** Moves to `target`, taps it, and waits `pause` ms for what follows to be seen. */
  click(target: Locator, pause?: number): Promise<void>
  type(target: Locator, text: string, ms: number): Promise<void>
  wait(ms: number): Promise<void>
  /** Words said aloud, shown for `ms` (the clip is muted). */
  say(text: string, ms: number): void
  /** A staged browser an agent drives, over `over`, for `ms`. */
  browser(over: Locator | Rect, ms: number, label: string, url: string): Promise<void>
  /** Calls the demo's clip hook (`window.muxtowerClip`). */
  hook(name: string, ...args: unknown[]): Promise<unknown>
  /** Changes sessions the way the demo's scenes do (`World.play`). */
  play(id: string, steps: unknown[]): Promise<void>
}

export interface ClipScript {
  id: string
  frame: ClipMeta['frame']
  viewport: { width: number; height: number }
  /** The demo's URL, after its origin (`?clip` is added). */
  path?: string
  /** Before the recording starts: set the scene. */
  setup?: (page: Page) => Promise<void>
  run: (r: Recorder) => Promise<void>
}

const FPS = 30
const DPR = 2
const MOVE_MS = 700 // the cursor's travel before a tap, as the finishing pass draws it

export async function record(script: ClipScript, demoUrl: string, outDir: string): Promise<ClipMeta> {
  const dir = `${outDir}/${script.id}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const phone = script.frame === 'phone'
  const context = await browser.newContext({
    viewport: script.viewport,
    deviceScaleFactor: DPR,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
  })
  const page = await context.newPage()
  const url = new URL(script.path ?? '/', demoUrl)
  url.searchParams.set('clip', '')
  await page.goto(url.toString())
  await page.waitForFunction(() => 'muxtowerClip' in window)
  await page.waitForTimeout(1200) // the list and its fonts in place
  await script.setup?.(page)
  await page.waitForTimeout(800)

  // Every frame Chrome draws, with when it was drawn.
  const shots: { t: number; data: string }[] = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', (f) => {
    shots.push({ t: f.metadata.timestamp ?? Date.now() / 1000, data: f.data })
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: script.viewport.width * DPR,
    maxHeight: script.viewport.height * DPR,
  })
  await page.waitForTimeout(300)
  const start = Date.now() / 1000
  const events: ClipEvent[] = []
  const now = () => Date.now() / 1000 - start
  /** Where `l` is once it stays put (a list moves rows to their new place with an animation). */
  const rectOf = async (l: Locator): Promise<Rect> => {
    let box = await l.boundingBox()
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(80)
      const again = await l.boundingBox()
      if (box && again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break
      box = again
    }
    if (!box) throw new Error(`${script.id}: nothing to point at`)
    return box
  }
  const r: Recorder = {
    page,
    now,
    caption: (text) => void events.push({ t: now(), kind: 'caption', text }),
    async focus(target) {
      const rect = target === null ? null : 'x' in target ? target : await rectOf(target)
      events.push({ t: now(), kind: 'focus', rect })
    },
    async click(target, pause = 900) {
      const box = await rectOf(target)
      await page.waitForTimeout(MOVE_MS)
      events.push({ t: now(), kind: 'click', x: box.x + box.width / 2, y: box.y + box.height / 2 })
      if (phone) await target.tap()
      else await target.click()
      await page.waitForTimeout(pause)
    },
    async type(target, text, ms) {
      const box = await rectOf(target)
      events.push({ t: now(), kind: 'type', x: box.x + 24, y: box.y + box.height / 2, ms })
      await target.pressSequentially(text, { delay: ms / text.length })
    },
    wait: (ms) => page.waitForTimeout(ms),
    say: (text, ms) => void events.push({ t: now(), kind: 'say', text, ms }),
    async browser(over, ms, label, url) {
      events.push({ t: now(), kind: 'browser', ms, rect: 'x' in over ? over : await rectOf(over), label, url })
    },
    hook: (name, ...args) =>
      page.evaluate(([name, args]) => (window as never as Hook).muxtowerClip[name as string]!(...(args as unknown[])), [name, args] as const),
    async play(id, steps) {
      await page.evaluate(([id, steps]) => (window as never as Clip).muxtowerClip.play(id as string, steps as unknown[]), [id, steps])
    },
  }
  await script.run(r)
  const end = now()
  await cdp.send('Page.stopScreencast')
  await browser.close()

  // A steady frame rate: each output frame shows the last frame drawn by then.
  const t0 = shots.find((s) => s.t >= start)?.t ?? start
  const files: string[] = []
  const written = new Map<number, string>()
  let k = 0
  for (let i = 0; i < Math.round(end * FPS); i++) {
    const at = start + i / FPS
    while (k + 1 < shots.length && shots[k + 1]!.t <= Math.max(at, t0)) k++
    if (!written.has(k)) {
      const name = `f${String(written.size).padStart(4, '0')}.jpg`
      writeFileSync(`${dir}/${name}`, Buffer.from(shots[k]!.data, 'base64'))
      written.set(k, name)
    }
    files.push(written.get(k)!)
  }
  const meta: ClipMeta = { id: script.id, frame: script.frame, viewport: script.viewport, dpr: DPR, fps: FPS, frames: files, events }
  writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 1))
  return meta
}

interface Clip {
  muxtowerClip: { play(id: string, steps: unknown[]): void }
}
interface Hook {
  muxtowerClip: Record<string, (...args: unknown[]) => unknown>
}
