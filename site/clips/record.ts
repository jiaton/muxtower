/** Records one clip: the demo app (built with the clip hook, `?clip`) in Playwright, on one or more screens
 *  at once (a desktop and a phone, each its own page and its own simulated daemon, kept in step by the
 *  script), each captured as it is drawn (Chrome's screencast), resampled to a steady frame rate, and a
 *  log of what the script did. Fake data only: everything comes from the demo's own simulated daemon. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium, type CDPSession, type Locator, type Page } from 'playwright'
import type { ClipEvent, ClipMeta, Layer, Rect, ViewMeta } from './clip.ts'

/** What a script does on one screen. */
export interface Screen {
  page: Page
  focus(target: Locator | Rect | null): Promise<void>
  /** Moves to `target`, taps it, and waits `pause` ms for what follows to be seen. */
  click(target: Locator, pause?: number): Promise<void>
  type(target: Locator, text: string, ms: number): Promise<void>
  /** A finger on `target`, dragged `dx` CSS px across in `ms` (touch events, as a real finger sends). */
  swipe(target: Locator, dx: number, ms?: number, from?: number): Promise<void>
  /** The mouse drags across `text` inside `target`, selecting it. */
  select(target: Locator, text: string, ms?: number): Promise<void>
  /** Typed into whatever has the focus: the keyboard alone, no pointer. */
  typeKeys(text: string, ms: number): Promise<void>
  /** A finger held on `target` for `ms`: a long press, which opens a row's menu. */
  press(target: Locator, ms?: number): Promise<void>
  /** Keys pressed, each shown as a key cap. */
  key(key: string, label: string): Promise<void>
  /** Words said aloud by this screen's owner, shown for `ms` (the clip is muted). */
  say(text: string, ms: number): void
  /** A staged browser an agent drives, over `over`, for `ms`. */
  browser(over: Locator | Rect, ms: number, label: string, url: string): Promise<void>
  /** An arrow from `from` to `to`, labelled, shown for `ms` (who handed work to whom). */
  arrow(from: Locator, to: Locator, label: string, ms: number): Promise<void>
  /** Names a machine beside the window: the part from `top` to `bottom` (its group of rows) is on it. */
  machine(top: Locator, bottom: Locator, label: string, note?: string): Promise<void>
  /** Calls the demo's clip hook (`window.muxtowerClip`). */
  hook(name: string, ...args: unknown[]): Promise<unknown>
  /** Changes sessions the way the demo's scenes do (`World.play`). */
  play(id: string, steps: unknown[]): Promise<void>
}

/** The script's whole stage: the first screen's actions, any screen by name, and what is no screen's. */
export interface Recorder extends Screen {
  on(view: string): Screen
  /** Calls the clip hook on every screen: what happens in the daemon shows on all of them. */
  everywhere(name: string, ...args: unknown[]): Promise<void>
  /** Seconds since the recording began. */
  now(): number
  caption(text: string): void
  /** A line in the drawn terminal. */
  term(text: string, tone?: Extract<ClipEvent, { kind: 'term' }>['tone']): void
  wait(ms: number): Promise<void>
}

export interface ViewScript {
  name: string
  kind: ViewMeta['kind']
  viewport: { width: number; height: number }
  /** The demo's URL, after its origin (`?clip` is added). */
  path?: string
  /** Before the recording starts: set the scene. */
  setup?: (page: Page) => Promise<void>
}

export interface ClipScript {
  id: string
  views: ViewScript[]
  layers: Layer[]
  run: (r: Recorder) => Promise<void>
}

const FPS = 30
const DPR = 2
const MOVE_MS = 700 // the cursor's travel before a tap, as the finishing pass draws it

export async function record(script: ClipScript, demoUrl: string, outDir: string): Promise<ClipMeta> {
  const dir = `${outDir}/${script.id}`
  rmSync(dir, { recursive: true, force: true })
  const browser = await chromium.launch()
  const opened: { view: ViewScript; page: Page; cdp: CDPSession; shots: { t: number; data: string }[] }[] = []
  for (const view of script.views) {
    const phone = view.kind === 'phone'
    const context = await browser.newContext({
      viewport: view.viewport,
      deviceScaleFactor: DPR,
      isMobile: phone,
      hasTouch: phone,
      reducedMotion: 'no-preference',
      colorScheme: 'light',
    })
    const page = await context.newPage()
    const url = new URL(view.path ?? '/', demoUrl)
    url.searchParams.set('clip', '')
    await page.goto(url.toString())
    await page.waitForFunction(() => 'muxtowerClip' in window)
    await page.waitForTimeout(1200) // the list and its fonts in place
    await view.setup?.(page)
    const cdp = await context.newCDPSession(page)
    opened.push({ view, page, cdp, shots: [] })
  }
  await opened[0]!.page.waitForTimeout(800)

  // Every frame Chrome draws on each screen, with when it was drawn.
  for (const o of opened) {
    o.cdp.on('Page.screencastFrame', (f) => {
      o.shots.push({ t: f.metadata.timestamp ?? Date.now() / 1000, data: f.data })
      void o.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await o.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: o.view.viewport.width * DPR,
      maxHeight: o.view.viewport.height * DPR,
    })
  }
  await opened[0]!.page.waitForTimeout(300)
  const start = Date.now() / 1000
  const events: ClipEvent[] = []
  const now = () => Date.now() / 1000 - start
  const wait = (ms: number) => opened[0]!.page.waitForTimeout(ms)

  const screen = ({ view, page, cdp }: (typeof opened)[number]): Screen => {
    const phone = view.kind === 'phone'
    const at = { view: view.name }
    /** Where `l` is once it stays put (a list moves rows to their new place with an animation). */
    const rectOf = async (l: Locator): Promise<Rect> => {
      let box = await l.boundingBox()
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(80)
        const again = await l.boundingBox()
        if (box && again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break
        box = again
      }
      if (!box) throw new Error(`${script.id}/${view.name}: nothing to point at`)
      return box
    }
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchStart' || type === 'touchMove' ? [{ x, y }] : [] })
    return {
      page,
      async focus(target) {
        const rect = target === null ? null : 'x' in target ? target : await rectOf(target)
        events.push({ t: now(), kind: 'focus', ...at, rect })
      },
      async click(target, pause = 900) {
        const box = await rectOf(target)
        await page.waitForTimeout(MOVE_MS)
        events.push({ t: now(), kind: 'click', ...at, x: box.x + box.width / 2, y: box.y + box.height / 2 })
        if (phone) await target.tap()
        else await target.click()
        await page.waitForTimeout(pause)
      },
      async type(target, text, ms) {
        const box = await rectOf(target)
        events.push({ t: now(), kind: 'type', ...at, x: box.x + 24, y: box.y + box.height / 2, ms })
        await target.pressSequentially(text, { delay: ms / text.length })
      },
      async swipe(target, dx, ms = 450, from = 0.75) {
        const box = await rectOf(target)
        const x = box.x + box.width * from
        const y = box.y + box.height / 2
        await page.waitForTimeout(MOVE_MS)
        events.push({ t: now(), kind: 'swipe', ...at, x, y, dx, ms })
        await touch('touchStart', x, y)
        const steps = Math.max(6, Math.round(ms / 16))
        for (let i = 1; i <= steps; i++) {
          // Eased like a finger: quick in the middle, slowing at the end (so it does not fling past).
          const p = 1 - (1 - i / steps) ** 2
          await touch('touchMove', x + dx * p, y + i * 0.3)
          await page.waitForTimeout(ms / steps)
        }
        await touch('touchEnd', x + dx, y)
      },
      async select(target, text, ms = 600) {
        await rectOf(target)
        const span = await target.evaluate((root, text) => {
          const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const i = n.textContent?.indexOf(text) ?? -1
            if (i < 0) continue
            const range = document.createRange()
            range.setStart(n, i)
            range.setEnd(n, i + 1)
            const a = range.getBoundingClientRect()
            range.setStart(n, i + text.length - 1)
            range.setEnd(n, i + text.length)
            const b = range.getBoundingClientRect()
            return { x: a.left + 1, y: a.top + a.height / 2, x2: b.right + 2, y2: b.top + b.height / 2 }
          }
          return null
        }, text)
        if (!span) throw new Error(`${script.id}/${view.name}: no "${text}" to select`)
        await page.waitForTimeout(MOVE_MS)
        events.push({ t: now(), kind: 'swipe', ...at, x: span.x, y: span.y, dx: span.x2 - span.x, dy: span.y2 - span.y, ms })
        await page.mouse.move(span.x, span.y)
        await page.mouse.down()
        const steps = Math.max(6, Math.round(ms / 16))
        for (let i = 1; i <= steps; i++) {
          const p = 1 - (1 - i / steps) ** 2
          await page.mouse.move(span.x + (span.x2 - span.x) * p, span.y + (span.y2 - span.y) * p)
          await page.waitForTimeout(ms / steps)
        }
        await page.mouse.up()
      },
      typeKeys: (text, ms) => page.keyboard.type(text, { delay: ms / text.length }),
      async press(target, ms = 650) {
        const box = await rectOf(target)
        const x = box.x + box.width * 0.4
        const y = box.y + box.height / 2
        await page.waitForTimeout(MOVE_MS)
        events.push({ t: now(), kind: 'press', ...at, x, y, ms })
        await touch('touchStart', x, y)
        await page.waitForTimeout(ms)
        // Where the browser does not take a long press for a right click itself (as Android's does), it
        // is given one there: the row's own handler opens its menu.
        const opened = await page.getByRole('menu').count()
        // The finger lifts as it does after a menu opened: no tap (a cancelled touch).
        await touch('touchCancel', x, y)
        if (!opened)
          await page.evaluate(
            ([x, y]) => {
              document
                .elementFromPoint(x!, y!)
                ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
            },
            [x, y],
          )
      },
      async key(key, label) {
        events.push({ t: now(), kind: 'key', label })
        await page.keyboard.press(key)
      },
      say: (text, ms) => void events.push({ t: now(), kind: 'say', ...at, text, ms }),
      async browser(over, ms, label, url) {
        events.push({ t: now(), kind: 'browser', ...at, ms, rect: 'x' in over ? over : await rectOf(over), label, url })
      },
      async arrow(from, to, label, ms) {
        const [a, b] = await Promise.all([rectOf(from), rectOf(to)])
        events.push({ t: now(), kind: 'arrow', ...at, from: a, to: b, label, ms })
      },
      async machine(top, bottom, label, note) {
        const [a, b] = await Promise.all([rectOf(top), rectOf(bottom)])
        const rect = { x: a.x, y: a.y, width: a.width, height: b.y + b.height - a.y }
        events.push({ t: now(), kind: 'machine', ...at, rect, label, note })
      },
      hook: (name, ...args) =>
        page.evaluate(([name, args]) => (window as never as Hook).muxtowerClip[name as string]!(...(args as unknown[])), [
          name,
          args,
        ] as const),
      async play(id, steps) {
        await page.evaluate(([id, steps]) => (window as never as Hook).muxtowerClip.play!(id as string, steps as unknown[]), [id, steps])
      },
    }
  }
  const screens = new Map(opened.map((o) => [o.view.name, screen(o)]))
  const first = screens.get(opened[0]!.view.name)!
  const r: Recorder = {
    ...first,
    on: (view) =>
      screens.get(view) ??
      (() => {
        throw new Error(`${script.id}: no view ${view}`)
      })(),
    async everywhere(name, ...args) {
      await Promise.all([...screens.values()].map((s) => s.hook(name, ...args)))
    },
    now,
    caption: (text) => void events.push({ t: now(), kind: 'caption', text }),
    term: (text, tone) => void events.push({ t: now(), kind: 'term', text, tone }),
    wait,
  }
  try {
    await script.run(r)
  } catch (error) {
    // What each screen showed when it went wrong, to see why.
    for (const o of opened) await o.page.screenshot({ path: `${dir}-${o.view.name}-failed.png` }).catch(() => {})
    await browser.close()
    throw error
  }
  const end = now()
  for (const o of opened) await o.cdp.send('Page.stopScreencast')
  await browser.close()

  // A steady frame rate: each output frame shows the last frame drawn by then.
  const length = Math.round(end * FPS)
  const views: ViewMeta[] = opened.map(({ view, shots }) => {
    mkdirSync(`${dir}/${view.name}`, { recursive: true })
    const t0 = shots.find((s) => s.t >= start)?.t ?? start
    const frames: string[] = []
    const written = new Map<number, string>()
    let k = 0
    for (let i = 0; i < length; i++) {
      const at = start + i / FPS
      while (k + 1 < shots.length && shots[k + 1]!.t <= Math.max(at, t0)) k++
      if (!written.has(k)) {
        const name = `${view.name}/f${String(written.size).padStart(4, '0')}.jpg`
        writeFileSync(`${dir}/${name}`, Buffer.from(shots[k]!.data, 'base64'))
        written.set(k, name)
      }
      frames.push(written.get(k)!)
    }
    return { name: view.name, kind: view.kind, viewport: view.viewport, frames }
  })
  const meta: ClipMeta = { id: script.id, dpr: DPR, fps: FPS, length, views, layers: script.layers, events }
  writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 1))
  return meta
}

interface Hook {
  muxtowerClip: Record<string, (...args: unknown[]) => unknown>
}
