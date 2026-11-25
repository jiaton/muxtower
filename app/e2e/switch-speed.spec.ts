// How long a click takes to show: a session picked in the list, a chip (a click, the wheel, ]), a project
// in the sidebar. Measured on a production build of the demo (built here into a temporary folder and served
// as files, unless MUXTOWER_SWITCH_URL names one), as main-thread CPU time from a Chrome trace: from the task
// that took the click's first input event to the end of the paint that showed its result (the row marked and
// the new session's header, both; a chip marked and the list changed), every task in between counted. CPU
// time, not wall clock, and a median of several clicks: steady on a loaded machine.
//
// The guard (the default): a session switch in a crowded list (80 sessions), CPU ×1, under BUDGET_MS.
//
// The full table (every interaction, 28 and 80 sessions, CPU ×1 and ×4):
//   MUXTOWER_SWITCH_REPORT=1 npx playwright test switch-speed
// Which components: a profiling build (React's profiling build, unminified) and a call tree from CPU samples:
//   MUXTOWER_SWITCH_REPORT=1 MUXTOWER_SWITCH_PROFILE=1 npx playwright test switch-speed
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { callTree, interactions, startTrace, type Interaction } from './trace-cpu'

/** The guard's budget (ms of main-thread CPU, CPU ×1, 80 sessions, median of the clicks). */
const BUDGET_MS = 1000

const REPORT = !!process.env.MUXTOWER_SWITCH_REPORT
const PROFILE = !!process.env.MUXTOWER_SWITCH_PROFILE
const SIZES = (process.env.MUXTOWER_SWITCH_SESSIONS ?? (REPORT ? '0,80' : '80')).split(',').map(Number)
const CPUS = (process.env.MUXTOWER_SWITCH_CPU ?? (REPORT ? '1,4' : '1')).split(',').map(Number)
const CLICKS = Number(process.env.MUXTOWER_SWITCH_CLICKS ?? 9)

let server: Server | undefined
let dir: string | undefined
let base = process.env.MUXTOWER_SWITCH_URL ?? ''

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
}

test.beforeAll(async () => {
  if (base) return
  test.setTimeout(180_000)
  dir = mkdtempSync(join(tmpdir(), 'muxtower-switch-'))
  execFileSync('npx', ['vite', 'build', '--mode', 'demo', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], {
    stdio: 'inherit',
    env: { ...process.env, MUXTOWER_BASE: '/', ...(PROFILE ? { MUXTOWER_PROFILE: '1' } : {}) },
  })
  const root = dir
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let file = join(root, path)
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** A result to wait for in the page: each condition true at once. `changed`: the list's rows differ from
 *  when it was set (which rows, how many). */
type Condition = { sel: string; text?: string; textStarts?: string } | { changed: string }

/** Installed before the app: `__expectResult(conditions)` marks `result` in the trace (`performance.mark`)
 *  as soon as a DOM change makes every condition true, from a MutationObserver (run in the task that
 *  changed the DOM, so the mark sits in the task that committed it). */
function installResultWatch() {
  const w = window as unknown as Record<string, unknown>
  const signature = (sel: string) => {
    const rows = [...document.querySelectorAll(sel)]
    const id = (el: Element | undefined) => (el ? `${el.getAttribute('href') ?? ''}=${el.textContent ?? ''}` : '')
    return `${rows.length}:${id(rows[0])}:${id(rows.at(-1))}`
  }
  let observer: MutationObserver | undefined
  w.__expectResult = (conditions: ({ sel: string; text?: string; textStarts?: string } | { changed: string })[]) => {
    observer?.disconnect()
    w.__resultAt = 0
    w.__conditionAt = conditions.map(() => 0)
    const before = conditions.map((c) => ('changed' in c ? signature(c.changed) : ''))
    const holds = (c: (typeof conditions)[number], i: number) => {
      if ('changed' in c) return signature(c.changed) !== before[i]
      return [...document.querySelectorAll(c.sel)].some(
        (el) =>
          (c.text === undefined || el.textContent === c.text) && (c.textStarts === undefined || el.textContent?.startsWith(c.textStarts)),
      )
    }
    observer = new MutationObserver(() => {
      const at = w.__conditionAt as number[]
      conditions.forEach((c, i) => {
        if (!at[i] && holds(c, i)) at[i] = performance.now()
      })
      if (at.every(Boolean)) {
        performance.mark('result')
        w.__resultAt = performance.now()
        observer?.disconnect()
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  }
  // Event Timing: each interaction's longest event.
  const seen = new Map<number, number>()
  w.__interactions = seen
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as PerformanceEventTiming[])
      if (e.interactionId) seen.set(e.interactionId, Math.max(seen.get(e.interactionId) ?? 0, e.duration))
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
}

/** The profiling build's commits, read through a stand-in for React DevTools' hook: each component's own
 *  render time (`selfBaseDuration` of every fiber that rendered), summed by name. */
function installReactProfile() {
  const w = window as unknown as Record<string, unknown>
  const byName = new Map<string, { ms: number; n: number }>()
  w.__renders = byName
  let lastCommit = 0
  type Fiber = {
    child: Fiber | null
    sibling: Fiber | null
    flags: number
    selfBaseDuration?: number
    actualDuration?: number
    actualStartTime?: number
    type: { name?: string; displayName?: string; render?: { name?: string }; type?: { name?: string } } | string | null
    tag: number
  }
  const nameOf = (f: Fiber) => {
    const t = f.type
    if (!t || typeof t === 'string') return null
    return t.displayName || t.name || t.render?.name || t.type?.name || null
  }
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer: unknown) {
      ;(this.renderers as Map<number, unknown>).set(1, renderer)
      return 1
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_: number, root: { current: Fiber }) {
      const since = lastCommit
      lastCommit = performance.now()
      if (!w.__profiling) return
      const stack: Fiber[] = [root.current]
      while (stack.length) {
        const f = stack.pop()!
        const name = nameOf(f)
        // Rendered in this commit's render (not a subtree it skipped, whose fibers keep their old flags).
        if (name && f.flags & 1 && f.selfBaseDuration && (f.actualStartTime ?? -1) >= since) {
          const e = byName.get(name) ?? { ms: 0, n: 0 }
          e.ms += f.selfBaseDuration
          e.n++
          byName.set(name, e)
        }
        if (f.sibling) stack.push(f.sibling)
        if (f.child) stack.push(f.child)
      }
    },
  }
}

const list = (page: Page) => page.locator('section[aria-label="Sessions"]')
const chips = (page: Page) => page.getByRole('navigation', { name: 'Projects' })
const sidebar = (page: Page) => page.locator('aside[aria-label="Navigation"]')

interface Measured {
  name: string
  runs: Interaction[]
  eventTiming: number[]
  /** When the first and the last condition held, after the click (ms, wall clock: which came first). */
  order: number[][]
}

/** Runs `act` (one interaction) `n` times inside one trace, each waiting for its result. */
async function measure(
  page: Page,
  name: string,
  n: number,
  setup: (i: number) => Promise<{ act: () => Promise<unknown>; conditions: Condition[] } | null>,
  { anchor = 'click', inputs = ['pointerdown', 'mousedown'] } = {},
): Promise<Measured> {
  const cdp = await page.context().newCDPSession(page)
  const stop = await startTrace(cdp, PROFILE)
  const eventTiming: number[] = []
  const order: number[][] = []
  for (let i = 0; i < n; i++) {
    const step = await setup(i)
    if (!step) continue
    await page.evaluate((c) => (window as unknown as { __expectResult: (c: unknown) => void }).__expectResult(c), step.conditions)
    const known = await page.evaluate(() => [...(window as unknown as { __interactions: Map<number, number> }).__interactions.keys()])
    const t0 = await page.evaluate(() => performance.now())
    await step.act()
    await page
      .waitForFunction(() => (window as unknown as { __resultAt: number }).__resultAt > 0, null, { timeout: 5000 })
      .catch(() => console.log(`${name}: no result after click ${i}`))
    await page.waitForTimeout(700) // what the click set off, and the Event Timing entry
    const got = await page.evaluate(
      ([seen, t]) => {
        const w = window as unknown as { __interactions: Map<number, number>; __conditionAt: number[] }
        const fresh = [...w.__interactions].filter(([id]) => !seen.includes(id)).map(([, ms]) => ms)
        return { et: fresh.length ? Math.max(...fresh) : -1, at: w.__conditionAt.map((x) => Math.round(x ? x - t : -1)) }
      },
      [known, t0] as const,
    )
    eventTiming.push(got.et)
    order.push(got.at)
  }
  const events = await stop()
  await cdp.detach()
  const runs = interactions(events, { anchor, inputs, resultMark: 'result' })
  if (PROFILE) {
    const tree = callTree(
      events,
      runs.map((r) => r.span),
    )
    const top = [...tree].sort((a, b) => b[1] - a[1]).slice(0, 40)
    console.log(`\n${name}: call tree (inclusive ms over ${runs.length} clicks, click to paint)`)
    for (const [fn, ms] of top) console.log(`  ${(ms / runs.length).toFixed(1).padStart(7)}  ${fn}`)
  }
  return { name, runs, eventTiming, order }
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => x >= 0).sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : -1
}

async function open(page: Page, sessions: number, cpu: number) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(installResultWatch)
  if (PROFILE) await page.addInitScript(installReactProfile)
  await page.goto(`${base}${sessions ? `?sessions=${sessions}` : ''}#/d/demo/s/web-app`)
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 30_000 })
  await expect(list(page).locator('[data-row-link]').first()).toBeVisible()
  await page.waitForTimeout(1500)
  const cdp = await page.context().newCDPSession(page)
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
}

/** A session switch: a click on another row (spread through the list), its row marked and its header shown. */
async function sessionSwitches(page: Page, n: number) {
  const rows = list(page).locator('[data-row-link]:visible')
  return measure(page, 'session switch', n, async (i) => {
    const count = await rows.count()
    const row: Locator = rows.nth((i * 7 + 3) % count)
    if ((await row.getAttribute('aria-current')) === 'page') return null
    const key = await row.evaluate((a) => a.closest('[data-row]')?.getAttribute('data-row') ?? '')
    const name = (await row.locator('span').first().textContent()) ?? ''
    await row.scrollIntoViewIfNeeded()
    return {
      act: () => row.click(),
      conditions: [
        { sel: `[data-row="${key}"] [aria-current="page"]` },
        { sel: 'section:has(textarea) header h1', text: name },
      ],
    }
  })
}

const CHIPS = ['Product', 'Ops', 'PMs', 'Product', 'Ops', 'PMs', 'Product', 'Ops', 'PMs']

async function chipClicks(page: Page, n: number) {
  return measure(page, 'chip click', n, async (i) => {
    const chip = chips(page).getByRole('link', { name: new RegExp(`^${CHIPS[i % CHIPS.length]}`) })
    if ((await chip.getAttribute('data-current')) === 'true') return null
    return {
      act: () => chip.click(),
      conditions: [
        { sel: 'nav[aria-label="Projects"] a[data-current="true"]', textStarts: CHIPS[i % CHIPS.length] },
        { changed: 'section[aria-label="Sessions"] [data-row-link]' },
      ],
    }
  })
}

async function chipWheels(page: Page, n: number) {
  const box = (await list(page).locator('[data-row-link]').first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // Forward through the chips to the end, then back: always a step.
  let dir = 1
  return measure(
    page,
    'chip wheel',
    n,
    async () => {
      const links = chips(page).getByRole('link')
      const total = await links.count()
      const at = await links.evaluateAll((ls) => ls.findIndex((l) => l.getAttribute('data-current') === 'true'))
      if (at >= total - 1) dir = -1
      if (at <= 0 && dir < 0 && at === -1) dir = 1
      await page.waitForTimeout(400) // past the wheel gesture's rest
      return {
        act: () => page.mouse.wheel(120 * dir, 0),
        conditions: [{ changed: 'nav[aria-label="Projects"] a[data-current="true"]' }, { changed: 'section[aria-label="Sessions"] [data-row-link]' }],
      }
    },
    { anchor: 'wheel', inputs: ['wheel'] },
  )
}

const PROJECTS = ['acme/docs', 'acme/mobile', 'labs/ml-pipeline', 'acme/web', 'acme/docs', 'acme/mobile', 'labs/ml-pipeline', 'acme/web', 'acme/docs']

async function sidebarProjects(page: Page, n: number) {
  return measure(page, 'sidebar project', n, async (i) => {
    const link = sidebar(page)
      .getByRole('link')
      .filter({ hasText: new RegExp(`^${PROJECTS[i % PROJECTS.length]}`) })
      .first()
    if ((await link.count()) === 0 || (await link.getAttribute('data-current')) === 'true') return null
    return {
      act: () => link.click(),
      conditions: [
        { sel: 'aside[aria-label="Navigation"] a[data-current="true"]', textStarts: PROJECTS[i % PROJECTS.length] },
        { changed: 'section[aria-label="Sessions"] [data-row-link]' },
      ],
    }
  })
}

function print(sessions: number, cpu: number, m: Measured) {
  const r = m.runs
  const kinds = [...new Set(r.flatMap((x) => Object.keys(x.kinds)))]
  const kindText = kinds.map((k) => `${k} ${median(r.map((x) => x.kinds[k] ?? 0))}`).join(', ')
  const longs = r.flatMap((x) => x.longTasks.map(([ms, what]) => `${ms} ${what}`))
  console.log(
    [
      `${sessions || 'demo'} sessions`,
      `×${cpu}`,
      m.name.padEnd(16),
      `to paint ${median(r.map((x) => x.toPaint))} ms CPU (max ${Math.max(...r.map((x) => x.toPaint))})`,
      `wall ${median(r.map((x) => x.wallToPaint))}`,
      `event timing ${median(m.eventTiming)}`,
      `all it set off ${median(r.map((x) => x.total))}`,
      `[${kindText}]`,
      `n=${r.length}${r.some((x) => x.missing) ? ` (${r.filter((x) => x.missing).length} without a result)` : ''}`,
    ].join(' | '),
  )
  console.log(`    conditions held at (ms after the click): ${m.order.map((o) => o.join('/')).join('  ')}`)
  if (longs.length) console.log(`    long tasks: ${longs.join('; ')}`)
}

async function reactProfile(page: Page, label: string, run: () => Promise<unknown>) {
  if (!PROFILE) return run()
  await page.evaluate(() => {
    const w = window as unknown as { __profiling: boolean; __renders: Map<string, unknown> }
    w.__renders.clear()
    w.__profiling = true
  })
  await run()
  const top = await page.evaluate(() => {
    const w = window as unknown as { __profiling: boolean; __renders: Map<string, { ms: number; n: number }> }
    w.__profiling = false
    return [...w.__renders].sort((a, b) => b[1].ms - a[1].ms).slice(0, 30)
  })
  console.log(`\n${label}: React render time by component (ms over all clicks, renders)`)
  for (const [name, { ms, n }] of top) console.log(`  ${ms.toFixed(1).padStart(8)}  ${String(n).padStart(5)}  ${name}`)
}

if (REPORT) {
  for (const sessions of SIZES)
    for (const cpu of CPUS)
      test(`report: ${sessions || 'demo'} sessions, CPU ×${cpu}`, async ({ page }) => {
        test.setTimeout(300_000)
        await open(page, sessions, cpu)
        const tag = `${sessions || 'demo'} sessions ×${cpu}`
        let m!: Measured
        await reactProfile(page, `${tag} session switch`, async () => (m = await sessionSwitches(page, CLICKS)))
        print(sessions, cpu, m)
        await reactProfile(page, `${tag} chip click`, async () => (m = await chipClicks(page, CLICKS)))
        print(sessions, cpu, m)
        await reactProfile(page, `${tag} chip wheel`, async () => (m = await chipWheels(page, CLICKS)))
        print(sessions, cpu, m)
        // Back to every project, from the chip row (the sidebar's projects pick within it).
        const current = chips(page).locator('a[data-current="true"]')
        if (await current.count()) await current.click()
        await page.waitForTimeout(500)
        await reactProfile(page, `${tag} sidebar project`, async () => (m = await sidebarProjects(page, CLICKS)))
        print(sessions, cpu, m)
      })
} else {
  test('a session switch paints within its budget (main-thread CPU, 80 sessions)', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 80, 1)
    const m = await sessionSwitches(page, CLICKS)
    print(80, 1, m)
    expect(m.runs.filter((r) => !r.missing).length).toBeGreaterThanOrEqual(5)
    expect(median(m.runs.map((r) => r.toPaint))).toBeLessThan(BUDGET_MS)
  })
}
