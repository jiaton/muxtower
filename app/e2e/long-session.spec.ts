// A long session on the demo's made-up hub, scripted, with the page's elements counted by area after each
// round: what keeps growing without bound is a leak; what levels off is the app's bounded growth (a
// conversation's 400 items, a terminal's scrollback kept while scrolled up). Each round switches sessions
// and chips (the wheel and [ ]), opens and closes the layout drawer, ⋯ menus, the header ⓘ popover and ⌘K,
// switches layouts and views, folds and unfolds groups, plays read-aloud, and scrolls a terminal up.
//
// Repeat it for longer, printing the table: MUXTOWER_LONG_MINUTES=5 MUXTOWER_E2E_PORT=4767 npx playwright
// test long-session. Its own default (a few rounds) keeps the suite quick. Under CPU throttling (a phone's
// speed): MUXTOWER_LONG_CPU=4.
import { expect, test, type Page } from '@playwright/test'

const DEMO = process.env.MUXTOWER_E2E_DEMO ?? 'http://127.0.0.1:4418/'
// Another build of the demo to measure (a production one, served as files: `npm run build:demo`), else the
// suite's dev server (React's development build: slower, and reloading on any edit while it runs).
const TARGET = process.env.MUXTOWER_LONG_URL || DEMO
const MINUTES = Number(process.env.MUXTOWER_LONG_MINUTES || 0)
const ROUNDS = MINUTES ? Infinity : 4
const CPU = Number(process.env.MUXTOWER_LONG_CPU || 1)

/** Every element of the page counted by the area it is in (the first marker it is inside). */
function countAreas(): Record<string, number> {
  const markers: [string, string][] = [
    ['terminal', '[aria-label="Session output"]'],
    ['conversation', ':not(svg)[aria-label="Conversation"]'],
    ['sidebar', 'aside[aria-label="Navigation"], [role="dialog"] nav[aria-label="Sessions"]'],
    ['list', 'section[aria-label="Sessions"]'],
    ['session header', 'section:has(textarea) > header'],
    ['session other', 'section:has(textarea)'],
  ]
  const counts: Record<string, number> = {}
  const add = (area: string) => (counts[area] = (counts[area] ?? 0) + 1)
  const root = document.getElementById('root')
  for (const el of document.getElementsByTagName('*')) {
    if (
      el === document.documentElement ||
      el === document.body ||
      document.head.contains(el) ||
      /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)
    ) {
      add('head')
      continue
    }
    if (root && !root.contains(el)) {
      // A portal: Radix's (menus, popovers, dialogs), dnd-kit's announcers, a toast…
      let top: Element = el
      while (top.parentElement && top.parentElement !== document.body) top = top.parentElement
      const kind = top.hasAttribute('data-radix-popper-content-wrapper')
        ? 'popper'
        : (top.getAttribute('role') ?? top.querySelector('[role]')?.getAttribute('role') ?? top.id ?? top.tagName.toLowerCase())
      add(`portal ${kind || top.tagName.toLowerCase()}`)
      continue
    }
    const area = markers.find(([, selector]) => el.closest(selector))?.[0] ?? 'other'
    add(area)
  }
  counts.total = document.getElementsByTagName('*').length
  return counts
}

const list = (page: Page) => page.locator('section[aria-label="Sessions"]')
const TRACE = !!process.env.MUXTOWER_LONG_TRACE
const quietly = async (what: Promise<unknown>) => {
  try {
    await what
  } catch {
    /* a control the current view does not show this round */
  }
}

async function openSession(page: Page, n: number) {
  await page.keyboard.press('Escape') // nothing left open over the list
  const rows = list(page).locator('[data-row-link]:visible') // not those in a folded group
  const count = await rows.count()
  if (count) await rows.nth(n % count).click({ timeout: 5000 })
}

/** Every interaction the page answered (Event Timing), kept in the page: its type, how long, and the label
 *  or role of what was pressed (the demo's made-up content; the app's own record never keeps a label). */
function recordInteractions() {
  const seen: { name: string; ms: number; id: number; work: number; target: string }[] = []
  ;(window as unknown as { __interactions: typeof seen }).__interactions = seen
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as PerformanceEventTiming[]) {
      if (!e.interactionId) continue
      const t = e.target instanceof Element ? e.target.closest('[aria-label], [role], button, a, textarea') : null
      const target = t
        ? `${t.tagName.toLowerCase()}${t.getAttribute('role') ? `[${t.getAttribute('role')}]` : ''} ${t.getAttribute('aria-label') ?? ''}`.trim()
        : ''
      seen.push({
        name: e.name,
        ms: Math.round(e.duration),
        id: e.interactionId,
        work: Math.round(e.processingEnd - e.processingStart),
        target,
      })
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
}
const interactionCount = (page: Page) => page.evaluate(() => (window as unknown as { __interactions: unknown[] }).__interactions.length)

type Timings = Map<string, { ms: number[]; worst: string }>

/** One step of a round, timed: the slowest interaction it made (its longest event, and the handler time). A
 *  step that hangs fails the run, named. */
async function step(page: Page, timings: Timings, name: string, run: () => Promise<unknown>) {
  const from = await interactionCount(page)
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    run(),
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`step "${name}" did not finish in 20 s`)), 20_000))),
  ]).finally(() => clearTimeout(timer))
  await page.waitForTimeout(120) // the entries come after the next paint
  const entries = await page.evaluate(
    (n) => (window as unknown as { __interactions: { name: string; ms: number; work: number; target: string }[] }).__interactions.slice(n),
    from,
  )
  const worst = entries.sort((a, b) => b.ms - a.ms)[0]
  const t = timings.get(name) ?? { ms: [], worst: '' }
  t.ms.push(worst?.ms ?? 0)
  if (worst && worst.ms >= Math.max(...t.ms)) t.worst = `${worst.name} on ${worst.target} (handlers ${worst.work} ms)`
  timings.set(name, t)
}

async function round(page: Page, i: number, t: Timings) {
  // From the full layout, whatever the last round left (a step that missed its control).
  await quietly(page.getByRole('radio', { name: 'Sidebar, list and session', exact: true }).first().click({ timeout: 1000 }))
  for (let n = 0; n < 4; n++) {
    await step(page, t, 'open a session from the list', () => openSession(page, i * 4 + n))
    await page.waitForTimeout(250)
  }
  await page.locator('body').click({ position: { x: 5, y: 895 } }) // outside any field
  for (const key of [']', ']', '[', '[']) {
    await step(page, t, `chip key ${key}`, () => page.keyboard.press(key))
    await page.waitForTimeout(150)
  }
  const box = await list(page).locator('[data-row-link]').first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(120, 0)
    await page.waitForTimeout(400)
    await page.mouse.wheel(-120, 0)
    await page.waitForTimeout(400)
  }
  const headers = list(page).locator('button[aria-expanded]:not([aria-haspopup])')
  const groups = Math.min(3, await headers.count())
  for (const _ of [0, 1])
    for (let g = 0; g < groups; g++) await step(page, t, 'fold or unfold a group', () => quietly(headers.nth(g).click({ timeout: 1000 })))
  await step(page, t, 'open a session from the list', () => openSession(page, i))
  // A row's ⋯ is made once a mouse points at the row.
  await quietly(list(page).locator('[data-row-link]:visible').first().hover({ timeout: 1000 }))
  await step(page, t, "a row's ⋯", () =>
    quietly(
      list(page)
        .getByRole('button', { name: /^Actions for / })
        .first()
        .click({ timeout: 1000, force: true }),
    ),
  )
  await page.keyboard.press('Escape')
  await step(page, t, "the session's ⋯", () => quietly(page.getByRole('button', { name: 'More actions' }).first().click({ timeout: 1000 })))
  await page.keyboard.press('Escape')
  await step(page, t, 'the header ⓘ', () => quietly(page.getByRole('button', { name: 'Session details' }).first().click({ timeout: 1000 })))
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await step(page, t, '⌘K', () => page.keyboard.press('Control+KeyK'))
  await step(page, t, '⌘K typed into', () =>
    quietly(page.getByPlaceholder(/^Sessions, role:pm/).pressSequentially('web', { timeout: 1000 })),
  )
  await page.waitForTimeout(200)
  await step(page, t, '⌘K closed', () => page.keyboard.press('Escape'))
  await step(page, t, 'the conversation view', () => quietly(page.getByRole('radio', { name: 'Conversation' }).click({ timeout: 1000 })))
  await page.waitForTimeout(300)
  await step(page, t, 'the terminal view', () => quietly(page.getByRole('radio', { name: 'Terminal' }).click({ timeout: 1000 })))
  const output = await page
    .locator('[aria-label="Session output"]')
    .first()
    .boundingBox()
    .catch(() => null)
  if (output) {
    await page.mouse.move(output.x + output.width / 2, output.y + output.height / 2)
    for (let s = 0; s < 5; s++) await page.mouse.wheel(0, -400)
    await page.waitForTimeout(200)
    await page.mouse.wheel(0, 5000)
  }
  await step(page, t, 'typed into the message box', () =>
    quietly(page.locator('textarea').first().pressSequentially('hello there', { timeout: 2000 })),
  )
  await quietly(page.locator('textarea').first().fill('', { timeout: 1000 }))
  await step(page, t, 'read aloud', () =>
    quietly(page.getByRole('button', { name: 'Read the last reply aloud' }).first().click({ timeout: 1000 })),
  )
  await page.waitForTimeout(400)
  await step(page, t, 'read aloud stopped', () =>
    quietly(page.getByRole('button', { name: 'Stop reading' }).first().click({ timeout: 1000 })),
  )
  await step(page, t, 'layout: list and session', () =>
    quietly(page.getByRole('radio', { name: 'List and session', exact: true }).first().click({ timeout: 1000 })),
  )
  await step(page, t, 'the drawer opened', () => quietly(page.getByRole('button', { name: /^Show the sidebar/ }).click({ timeout: 1000 })))
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await step(page, t, 'layout: session only', () =>
    quietly(page.getByRole('radio', { name: 'Session only', exact: true }).first().click({ timeout: 1000 })),
  )
  await step(page, t, 'the drawer opened', () => quietly(page.getByRole('button', { name: /^Show sessions/ }).click({ timeout: 1000 })))
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await step(page, t, 'layout: full', () =>
    quietly(page.getByRole('radio', { name: 'Sidebar, list and session', exact: true }).first().click({ timeout: 1000 })),
  )
  await page.waitForTimeout(300)
}

test('a long session: what grows, by area, and what is slow', async ({ page }) => {
  test.setTimeout((MINUTES || 2) * 60_000 + 180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  if (CPU > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU })
  if (TRACE) {
    page.on('crash', () => console.log('crashed'))
    page.on('console', (m) => m.type() === 'error' && console.log('console error', m.text().slice(0, 200)))
  }
  await page.addInitScript(recordInteractions)
  await page.goto(`${TARGET}#/d/demo/s/web-app`)
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)
  const rows: Record<string, number>[] = [{ round: 0, ...(await page.evaluate(countAreas)) }]
  const timings: Timings = new Map()
  const started = Date.now()
  const until = started + MINUTES * 60_000
  for (let i = 0; i < ROUNDS && (MINUTES ? Date.now() < until : true); i++) {
    await round(page, i, timings)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    rows.push({ round: i + 1, seconds: Math.round((Date.now() - started) / 1000), ...(await page.evaluate(countAreas)) })
    if (TRACE) console.log(`round ${i + 1} at ${rows.at(-1)!.seconds} s: ${rows.at(-1)!.total} elements`)
  }
  const areas = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((a) => a !== 'round' && a !== 'seconds')
  console.log(['round', 's', ...areas].join('\t'))
  for (const r of rows) console.log([r.round, r.seconds ?? 0, ...areas.map((a) => r[a] ?? 0)].join('\t'))
  const sorted = (ms: number[]) => [...ms].sort((a, b) => a - b)
  console.log(`\nslowest interaction per step (ms, CPU ×${CPU}): median, max, and the worst`)
  for (const [name, { ms, worst }] of [...timings].sort((a, b) => Math.max(...b[1].ms) - Math.max(...a[1].ms)))
    console.log(`${name}\t${sorted(ms)[Math.floor((ms.length - 1) / 2)]}\t${Math.max(...ms)}\t${worst}`)
  // The same page after rounds of the same things: about as many elements as after the first, give or take
  // what the demo's sessions said meanwhile. Nothing left open (no portal) once all is closed.
  const first = rows[1]!.total!
  const last = rows.at(-1)!.total!
  expect(last).toBeLessThan(first * 1.3)
  expect(areas.filter((a) => a.startsWith('portal') && (rows.at(-1)![a] ?? 0) > 0)).toEqual([])
})
